import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { demoData } from '../data/demoData'
import type { ProductionEvent, Question, ShopData } from '../domain/types'
import { calculateStepMetrics } from '../domain/routing'
import { nextChronologicalNumber } from '../domain/orderNumbers'
import { appendQuestionReply } from '../domain/questions'
import { env } from '../lib/env'
import { sanitizePlainText } from '../lib/format'
import { addSalesOrderLine as addSalesOrderLineRecord, createCustomer, createSalesOrder, createWorkOrder, loadShopData, markSalesOrderMilestone, recordProductionAdjustment, recordProductionEvent, reverseProductionEvent, sendQuestion, setSalesOrderArchived as setSalesOrderArchivedRecord, setSalesOrderLineArchived as setSalesOrderLineArchivedRecord, setWorkOrderArchived as setWorkOrderArchivedRecord, updateCustomer, updateSalesOrderLine, type CustomerInput, type SalesOrderInput, type SalesOrderLineInput, type WorkOrderInput } from '../services/shopService'
import { useAuth } from './AuthContext'

interface ShopValue {
  data: ShopData | null
  loading: boolean
  error: string | null
  notice: string | null
  lastEventId: string | null
  refresh: () => Promise<void>
  transact: (input: { workOrderId: string; routingStepId: string; eventType: 'transfer' | 'scrap'; quantity: number; toRoutingStepId: string | null }) => Promise<void>
  undoLast: () => Promise<void>
  addQuestion: (input: { customerId: string; salesOrderId: string | null; message: string }) => Promise<void>
  addCustomer: (input: CustomerInput) => Promise<void>
  editCustomer: (customerId: string, input: CustomerInput) => Promise<void>
  addSalesOrder: (input: SalesOrderInput) => Promise<void>
  addSalesOrderLine: (salesOrderId: string, input: SalesOrderLineInput) => Promise<void>
  editSalesOrderLine: (lineId: string, input: SalesOrderLineInput) => Promise<void>
  setSalesOrderLineArchived: (lineId: string, archived: boolean) => Promise<void>
  setSalesOrderArchived: (salesOrderId: string, archived: boolean) => Promise<void>
  setWorkOrderArchived: (workOrderId: string, archived: boolean) => Promise<void>
  markOrderMilestone: (salesOrderId: string, milestone: 'shipped' | 'invoiced') => Promise<void>
  addWorkOrder: (input: WorkOrderInput) => Promise<void>
  addProductionAdjustment: (input: { workOrderId: string; routingStepId: string; quantity: number }) => Promise<void>
  clearNotice: () => void
}

const ShopContext = createContext<ShopValue | null>(null)

function updateDemoCompletions(current: ShopData, productionEvents: ProductionEvent[]): ShopData {
  return {
    ...current,
    productionEvents,
    workOrders: current.workOrders.map((workOrder) => {
      const metrics = calculateStepMetrics(workOrder, productionEvents)
      const final = metrics.at(-1)
      const complete = metrics.length > 0 && metrics.every((metric) => metric.available === 0) && (final?.transferred ?? 0) >= workOrder.quantityOrdered
      return { ...workOrder, completionDate: complete ? workOrder.completionDate ?? new Date().toISOString().slice(0, 10) : null }
    }),
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const profileId = profile?.id ?? null
  const profileRole = profile?.role ?? null
  const [data, setData] = useState<ShopData | null>(env.demoMode ? structuredClone(demoData) : null)
  const [loading, setLoading] = useState(!env.demoMode)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (env.demoMode || !profileId || !profileRole) return
    setLoading(true)
    try { setData(await loadShopData(profileRole)); setError(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load shop data.') }
    finally { setLoading(false) }
  }, [profileId, profileRole])

  useEffect(() => {
    setError(null)
    setNotice(null)
    setLastEventId(null)
    if (env.demoMode) {
      setData(structuredClone(demoData))
      setLoading(false)
      return
    }
    setData(null)
    if (!profileId) {
      setLoading(false)
      return
    }
    void refresh()
  }, [profileId, profileRole, refresh])

  const transact: ShopValue['transact'] = async (input) => {
    if (!data || !profile) return
    if (data.workOrders.find((workOrder) => workOrder.id === input.workOrderId)?.archivedAt) throw new Error('Restore the work order before recording production.')
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (env.demoMode) {
      const event: ProductionEvent = {
        id: crypto.randomUUID(), organizationId: profile.organizationId, workOrderId: input.workOrderId,
        routingStepId: input.routingStepId, eventType: input.eventType, quantity: input.quantity,
        fromRoutingStepId: input.eventType === 'transfer' ? input.routingStepId : null,
        toRoutingStepId: input.eventType === 'transfer' ? input.toRoutingStepId : null,
        reversedEventId: null, createdAt: new Date().toISOString(),
      }
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, event]) : current)
      setLastEventId(event.id)
    } else {
      const event = await recordProductionEvent(input)
      setLastEventId(event.id)
      await refresh()
    }
    setNotice(input.eventType === 'scrap' ? `Recorded ${input.quantity} scrap` : `Transferred ${input.quantity}`)
  }

  const undoLast = async () => {
    if (!lastEventId) return
    if (env.demoMode) {
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, {
        id: crypto.randomUUID(), organizationId: current.organization.id, workOrderId: current.productionEvents.find((event) => event.id === lastEventId)?.workOrderId ?? '', routingStepId: current.productionEvents.find((event) => event.id === lastEventId)?.routingStepId ?? '', eventType: 'reversal', quantity: current.productionEvents.find((event) => event.id === lastEventId)?.quantity ?? 0, fromRoutingStepId: null, toRoutingStepId: null, reversedEventId: lastEventId, createdAt: new Date().toISOString(),
      }]) : current)
    } else {
      await reverseProductionEvent(lastEventId)
      await refresh()
    }
    setNotice('Last transaction undone')
    setLastEventId(null)
  }

  const addQuestion: ShopValue['addQuestion'] = async (input) => {
    if (!data || !profile) return
    const message = sanitizePlainText(input.message)
    if (!message) throw new Error('Enter a plain-text message.')
    const next: Question = { id: crypto.randomUUID(), organizationId: profile.organizationId, customerId: input.customerId, salesOrderId: input.salesOrderId, senderType: profile.role, message, createdAt: new Date().toISOString(), readAt: null }
    if (env.demoMode) setData((current) => current ? { ...current, questions: appendQuestionReply(current.questions, next) } : current)
    else { await sendQuestion(next); await refresh() }
    setNotice('Message sent')
  }

  const addCustomer: ShopValue['addCustomer'] = async (input) => {
    if (env.demoMode) {
      setData((current) => current ? { ...current, customers: [...current.customers, { id: crypto.randomUUID(), organizationId: input.organizationId, customerName: input.customerName, logoUrl: input.logoUrl.trim() || null, primaryAddress: input.primaryAddress, defaultShipToAddress: input.shipToAddress, defaultBillToAddress: input.billToAddress }] } : current)
    } else { await createCustomer(input); await refresh() }
    setNotice('Customer created')
  }

  const editCustomer: ShopValue['editCustomer'] = async (customerId, input) => {
    if (env.demoMode) {
      setData((current) => current ? { ...current, customers: current.customers.map((customer) => customer.id === customerId ? { ...customer, customerName: input.customerName, logoUrl: input.logoUrl.trim() || null, primaryAddress: input.primaryAddress, defaultShipToAddress: input.shipToAddress, defaultBillToAddress: input.billToAddress } : customer) } : current)
    } else { await updateCustomer(customerId, input); await refresh() }
    setNotice('Customer updated')
  }

  const addSalesOrder: ShopValue['addSalesOrder'] = async (input) => {
    if (env.demoMode) {
      const id = crypto.randomUUID()
      setData((current) => {
        if (!current) return current
        const salesOrderNumber = nextChronologicalNumber(current.salesOrders.filter((order) => order.organizationId === input.organizationId).map((order) => order.salesOrderNumber), 4)
        const salesOrderName = input.salesOrderName.trim() || salesOrderNumber
        return { ...current, salesOrders: [{ id, organizationId: input.organizationId, salesOrderNumber, salesOrderName, customerId: input.customerId, customerName: input.customerName, customerAddress: input.customerAddress, customerPoNumber: input.customerPoNumber, shipToAddress: input.shipToAddress, billToAddress: input.billToAddress, dateReceived: input.dateReceived, orderDueDate: input.orderDueDate, shippedAt: null, invoicedAt: null, archivedAt: null, notes: input.notes, lines: input.lines.map((line) => ({ id: crypto.randomUUID(), salesOrderId: id, lineNumber: line.lineNumber, partNumber: line.partNumber, description: line.description, manufacturedItem: line.manufacturedItem, pricingType: line.pricingType, quantity: line.quantity, unitPrice: line.unitPrice, flatRateAmount: line.flatRateAmount, lineTotal: line.pricingType === 'per_piece' ? line.quantity * (line.unitPrice ?? 0) : line.flatRateAmount ?? 0, sortOrder: line.sortOrder, archivedAt: null })) }, ...current.salesOrders] }
      })
    } else { await createSalesOrder(input); await refresh() }
    setNotice('Sales order created')
  }

  const addSalesOrderLine: ShopValue['addSalesOrderLine'] = async (salesOrderId, input) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can add sales order lines.')
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (!input.description.trim()) throw new Error('Enter a line description.')
    if (input.manufacturedItem && !input.partNumber?.trim()) throw new Error('Manufactured items require a part number.')
    if (env.demoMode) {
      setData((current) => {
        if (!current) return current
        const order = current.salesOrders.find((candidate) => candidate.id === salesOrderId)
        if (!order) throw new Error('Sales order not found or access denied.')
        if (order.invoicedAt) throw new Error('Line items cannot be added after the sales order is invoiced.')
        const lineNumber = Math.max(0, ...order.lines.map((line) => line.lineNumber)) + 1
        const sortOrder = Math.max(0, ...order.lines.map((line) => line.sortOrder)) + 10
        const lineTotal = input.pricingType === 'per_piece' ? input.quantity * (input.unitPrice ?? 0) : input.flatRateAmount ?? 0
        return {
          ...current,
          salesOrders: current.salesOrders.map((candidate) => candidate.id === salesOrderId ? {
            ...candidate,
            lines: [...candidate.lines, { id: crypto.randomUUID(), salesOrderId, lineNumber, partNumber: input.partNumber?.trim() || null, description: input.description.trim(), manufacturedItem: input.manufacturedItem, pricingType: input.pricingType, quantity: input.quantity, unitPrice: input.unitPrice, flatRateAmount: input.flatRateAmount, lineTotal, sortOrder, archivedAt: null }],
          } : candidate),
        }
      })
    } else {
      await addSalesOrderLineRecord(salesOrderId, input)
      await refresh()
    }
    setNotice('Line item added')
  }

  const editSalesOrderLine: ShopValue['editSalesOrderLine'] = async (lineId, input) => {
    if (!data || profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can edit sales order lines.')
    const order = data.salesOrders.find((candidate) => candidate.lines.some((line) => line.id === lineId))
    const line = order?.lines.find((candidate) => candidate.id === lineId)
    if (!order || !line) throw new Error('Sales order line not found or access denied.')
    if (order.archivedAt) throw new Error('Restore the sales order before changing line items.')
    if (order.invoicedAt) throw new Error('Line items cannot be changed after the sales order is invoiced.')
    if (line.archivedAt) throw new Error('Restore the line item before editing it.')
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (!input.description.trim()) throw new Error('Enter a line description.')
    if (input.manufacturedItem && !input.partNumber?.trim()) throw new Error('Manufactured items require a part number.')
    const linked = data.workOrders.some((workOrder) => workOrder.salesOrderLineItemId === lineId)
    if (linked && (input.partNumber?.trim() !== line.partNumber || input.manufacturedItem !== line.manufacturedItem)) throw new Error('Part number and manufactured status cannot change after a work order is linked.')
    if (env.demoMode) {
      const lineTotal = input.pricingType === 'per_piece' ? input.quantity * (input.unitPrice ?? 0) : input.flatRateAmount ?? 0
      setData((current) => current ? { ...current, salesOrders: current.salesOrders.map((candidate) => ({ ...candidate, lines: candidate.lines.map((existing) => existing.id === lineId ? { ...existing, partNumber: input.partNumber?.trim() || null, description: input.description.trim(), manufacturedItem: input.manufacturedItem, pricingType: input.pricingType, quantity: input.quantity, unitPrice: input.unitPrice, flatRateAmount: input.flatRateAmount, lineTotal } : existing) })) } : current)
    } else { await updateSalesOrderLine(lineId, input); await refresh() }
    setNotice('Line item updated')
  }

  const setSalesOrderLineArchived: ShopValue['setSalesOrderLineArchived'] = async (lineId, archived) => {
    if (!data || profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can archive sales order lines.')
    const order = data.salesOrders.find((candidate) => candidate.lines.some((line) => line.id === lineId))
    const line = order?.lines.find((candidate) => candidate.id === lineId)
    if (!order || !line) throw new Error('Sales order line not found or access denied.')
    if (order.archivedAt) throw new Error('Restore the sales order before changing line items.')
    if (order.invoicedAt) throw new Error('Line items cannot be changed after the sales order is invoiced.')
    if (archived && data.workOrders.some((workOrder) => workOrder.salesOrderLineItemId === lineId)) throw new Error('Archive is unavailable while a work order is linked to this line item.')
    if (archived && order.lines.filter((candidate) => !candidate.archivedAt).length <= 1) throw new Error('A sales order must keep at least one active line item.')
    const archivedAt = archived ? new Date().toISOString() : null
    if (env.demoMode) setData((current) => current ? { ...current, salesOrders: current.salesOrders.map((candidate) => ({ ...candidate, lines: candidate.lines.map((existing) => existing.id === lineId ? { ...existing, archivedAt } : existing) })) } : current)
    else { await setSalesOrderLineArchivedRecord(lineId, archived); await refresh() }
    setNotice(archived ? 'Line item archived' : 'Line item restored')
  }

  const setSalesOrderArchived: ShopValue['setSalesOrderArchived'] = async (salesOrderId, archived) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can archive sales orders.')
    const archivedAt = archived ? new Date().toISOString() : null
    if (env.demoMode) setData((current) => current ? { ...current, salesOrders: current.salesOrders.map((order) => order.id === salesOrderId ? { ...order, archivedAt } : order) } : current)
    else { await setSalesOrderArchivedRecord(salesOrderId, archived); await refresh() }
    setNotice(archived ? 'Sales order archived' : 'Sales order restored')
  }

  const setWorkOrderArchived: ShopValue['setWorkOrderArchived'] = async (workOrderId, archived) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can archive work orders.')
    const archivedAt = archived ? new Date().toISOString() : null
    if (env.demoMode) setData((current) => current ? { ...current, workOrders: current.workOrders.map((workOrder) => workOrder.id === workOrderId ? { ...workOrder, archivedAt } : workOrder) } : current)
    else { await setWorkOrderArchivedRecord(workOrderId, archived); await refresh() }
    setNotice(archived ? 'Work order archived' : 'Work order restored')
  }

  const markOrderMilestone: ShopValue['markOrderMilestone'] = async (salesOrderId, milestone) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can update order fulfillment.')
    if (data?.salesOrders.find((order) => order.id === salesOrderId)?.archivedAt) throw new Error('Restore the sales order before updating fulfillment.')
    const timestamp = new Date().toISOString()
    if (env.demoMode) {
      setData((current) => current ? {
        ...current,
        salesOrders: current.salesOrders.map((order) => order.id === salesOrderId
          ? { ...order, [milestone === 'shipped' ? 'shippedAt' : 'invoicedAt']: timestamp }
          : order),
      } : current)
    } else {
      await markSalesOrderMilestone(salesOrderId, milestone)
      await refresh()
    }
    setNotice(milestone === 'shipped' ? 'Sales order marked shipped' : 'Sales order marked invoiced')
  }

  const addWorkOrder: ShopValue['addWorkOrder'] = async (input) => {
    const salesOrder = data?.salesOrders.find((order) => order.id === input.salesOrderId)
    if (salesOrder?.archivedAt) throw new Error('Restore the sales order before creating work orders.')
    if (salesOrder?.lines.find((line) => line.id === input.salesOrderLineItemId)?.archivedAt) throw new Error('Restore the sales order line before creating work orders.')
    if (env.demoMode) {
      const id = crypto.randomUUID()
      const firstStepId = crypto.randomUUID()
      const routing = input.routing.map((step, index) => ({ id: index === 0 ? firstStepId : crypto.randomUUID(), workOrderId: id, sequenceNumber: step.sequenceNumber, routingStepName: step.name, customerStageName: step.customerStageName, workInstructions: step.instructions, notes: '' }))
      const releasedAt = new Date().toISOString()
      setData((current) => {
        if (!current) return current
        const workOrderNumber = nextChronologicalNumber(current.workOrders.filter((workOrder) => workOrder.organizationId === input.organizationId).map((workOrder) => workOrder.workOrderNumber), 6)
        const workOrderName = input.workOrderName.trim() || workOrderNumber
        return { ...current, workOrders: [...current.workOrders, { id, organizationId: input.organizationId, workOrderNumber, workOrderName, salesOrderId: input.salesOrderId, salesOrderLineItemId: input.salesOrderLineItemId, partNumber: input.partNumber, quantityOrdered: input.quantityOrdered, dueDate: input.dueDate, releasedAt, completionDate: null, archivedAt: null, notes: input.notes, routing }], productionEvents: [...current.productionEvents, { id: crypto.randomUUID(), organizationId: input.organizationId, workOrderId: id, routingStepId: firstStepId, eventType: 'release', quantity: input.quantityOrdered, fromRoutingStepId: null, toRoutingStepId: firstStepId, reversedEventId: null, createdAt: releasedAt }] }
      })
    } else { await createWorkOrder(input); await refresh() }
    setNotice('Work order released')
  }

  const addProductionAdjustment: ShopValue['addProductionAdjustment'] = async (input) => {
    if (!data || !profile || !Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (data.workOrders.find((workOrder) => workOrder.id === input.workOrderId)?.archivedAt) throw new Error('Restore the work order before recording production.')
    if (env.demoMode) {
      const event: ProductionEvent = { id: crypto.randomUUID(), organizationId: profile.organizationId, workOrderId: input.workOrderId, routingStepId: input.routingStepId, eventType: 'adjustment', quantity: input.quantity, fromRoutingStepId: null, toRoutingStepId: input.routingStepId, reversedEventId: null, createdAt: new Date().toISOString() }
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, event]) : current)
    } else { await recordProductionAdjustment(input); await refresh() }
    setNotice(`Added ${input.quantity} overrun piece${input.quantity === 1 ? '' : 's'}`)
  }

  const value: ShopValue = { data, loading, error, notice, lastEventId, refresh, transact, undoLast, addQuestion, addCustomer, editCustomer, addSalesOrder, addSalesOrderLine, editSalesOrderLine, setSalesOrderLineArchived, setSalesOrderArchived, setWorkOrderArchived, markOrderMilestone, addWorkOrder, addProductionAdjustment, clearNotice: () => setNotice(null) }
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside ShopProvider')
  return value
}
