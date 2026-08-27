import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { demoData } from '../data/demoData'
import type { ProductionEvent, Question, ShopData } from '../domain/types'
import { calculateStepMetrics } from '../domain/routing'
import { env } from '../lib/env'
import { sanitizePlainText } from '../lib/format'
import { createCustomer, createSalesOrder, createWorkOrder, loadShopData, recordProductionAdjustment, recordProductionEvent, reverseProductionEvent, sendQuestion, type CustomerInput, type SalesOrderInput, type WorkOrderInput } from '../services/shopService'
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
  addSalesOrder: (input: SalesOrderInput) => Promise<void>
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
    if (env.demoMode) setData((current) => current ? { ...current, questions: [...current.questions, next] } : current)
    else { await sendQuestion(next); await refresh() }
    setNotice('Message sent')
  }

  const addCustomer: ShopValue['addCustomer'] = async (input) => {
    if (env.demoMode) {
      setData((current) => current ? { ...current, customers: [...current.customers, { id: crypto.randomUUID(), organizationId: input.organizationId, customerName: input.customerName, primaryAddress: input.primaryAddress, defaultShipToAddress: input.shipToAddress, defaultBillToAddress: input.billToAddress }] } : current)
    } else { await createCustomer(input); await refresh() }
    setNotice('Customer created')
  }

  const addSalesOrder: ShopValue['addSalesOrder'] = async (input) => {
    if (env.demoMode) {
      const id = crypto.randomUUID()
      setData((current) => current ? { ...current, salesOrders: [{ id, organizationId: input.organizationId, salesOrderNumber: input.salesOrderNumber, customerId: input.customerId, customerName: input.customerName, customerAddress: input.customerAddress, customerPoNumber: input.customerPoNumber, shipToAddress: input.shipToAddress, billToAddress: input.billToAddress, dateReceived: input.dateReceived, orderDueDate: input.orderDueDate, notes: input.notes, lines: input.lines.map((line) => ({ id: crypto.randomUUID(), salesOrderId: id, lineNumber: line.lineNumber, partNumber: line.partNumber, description: line.description, manufacturedItem: line.manufacturedItem, pricingType: line.pricingType, quantity: line.quantity, unitPrice: line.unitPrice, flatRateAmount: line.flatRateAmount, lineTotal: line.pricingType === 'per_piece' ? line.quantity * (line.unitPrice ?? 0) : line.flatRateAmount ?? 0, sortOrder: line.sortOrder })) }, ...current.salesOrders] } : current)
    } else { await createSalesOrder(input); await refresh() }
    setNotice('Sales order created')
  }

  const addWorkOrder: ShopValue['addWorkOrder'] = async (input) => {
    if (env.demoMode) {
      const id = crypto.randomUUID()
      const firstStepId = crypto.randomUUID()
      const routing = input.routing.map((step, index) => ({ id: index === 0 ? firstStepId : crypto.randomUUID(), workOrderId: id, sequenceNumber: step.sequenceNumber, routingStepName: step.name, customerStageName: step.customerStageName, workInstructions: step.instructions, workInstructionsRevision: step.revision, notes: '' }))
      const releasedAt = new Date().toISOString()
      setData((current) => current ? { ...current, workOrders: [...current.workOrders, { id, organizationId: input.organizationId, workOrderNumber: input.workOrderNumber, salesOrderId: input.salesOrderId, salesOrderLineItemId: input.salesOrderLineItemId, partNumber: input.partNumber, quantityOrdered: input.quantityOrdered, dueDate: input.dueDate, releasedAt, completionDate: null, notes: input.notes, routing }], productionEvents: [...current.productionEvents, { id: crypto.randomUUID(), organizationId: input.organizationId, workOrderId: id, routingStepId: firstStepId, eventType: 'release', quantity: input.quantityOrdered, fromRoutingStepId: null, toRoutingStepId: firstStepId, reversedEventId: null, createdAt: releasedAt }] } : current)
    } else { await createWorkOrder(input); await refresh() }
    setNotice('Work order released')
  }

  const addProductionAdjustment: ShopValue['addProductionAdjustment'] = async (input) => {
    if (!data || !profile || !Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (env.demoMode) {
      const event: ProductionEvent = { id: crypto.randomUUID(), organizationId: profile.organizationId, workOrderId: input.workOrderId, routingStepId: input.routingStepId, eventType: 'adjustment', quantity: input.quantity, fromRoutingStepId: null, toRoutingStepId: input.routingStepId, reversedEventId: null, createdAt: new Date().toISOString() }
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, event]) : current)
    } else { await recordProductionAdjustment(input); await refresh() }
    setNotice(`Added ${input.quantity} overrun piece${input.quantity === 1 ? '' : 's'}`)
  }

  const value: ShopValue = { data, loading, error, notice, lastEventId, refresh, transact, undoLast, addQuestion, addCustomer, addSalesOrder, addWorkOrder, addProductionAdjustment, clearNotice: () => setNotice(null) }
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside ShopProvider')
  return value
}
