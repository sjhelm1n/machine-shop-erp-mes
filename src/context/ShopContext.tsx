import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { demoData } from '../data/demoData'
import type { ProductionEvent, Question, ShopData, ToolAssembly } from '../domain/types'
import { calculateStepMetrics } from '../domain/routing'
import { nextChronologicalNumber, nextPrefixedChronologicalNumber } from '../domain/orderNumbers'
import { appendQuestionReply, plainTextQuestionMessage, salesOrderConversationLifecycle } from '../domain/questions'
import { normalizeEmailDomain } from '../domain/userManagement'
import { checkedOutQuantity, deriveToolUsage, normalizeToolNumber, operationCheckoutError, validateCheckoutTransaction, validateToolingDraft, type ToolingDraft } from '../domain/tooling'
import { validateToolAssemblyImage } from '../domain/toolImageSecurity'
import { env } from '../lib/env'
import { calendarDateInTimeZone } from '../lib/format'
import { addSalesOrderLine as addSalesOrderLineRecord, createCustomer, createSalesOrder, createWorkOrder, loadShopData, markSalesOrderMilestone, recordProductionAdjustment, recordProductionEvent, recordToolCheckout as recordToolCheckoutRecord, removeToolAssemblyImage as removeToolAssemblyImageRecord, reverseProductionEvent, saveRoutingTemplate as saveRoutingTemplateRecord, saveToolAssembly as saveToolAssemblyRecord, saveWorkOrderOperationTools as saveWorkOrderOperationToolsRecord, sendQuestion, setRoutingTemplateArchived as setRoutingTemplateArchivedRecord, setSalesOrderArchived as setSalesOrderArchivedRecord, setSalesOrderLineArchived as setSalesOrderLineArchivedRecord, setToolAssemblyArchived as setToolAssemblyArchivedRecord, setWorkOrderArchived as setWorkOrderArchivedRecord, updateCustomer, updateSalesOrderLine, updateWorkOrder as updateWorkOrderRecord, uploadToolAssemblyImage as uploadToolAssemblyImageRecord, type CustomerInput, type RoutingTemplateInput, type SalesOrderInput, type SalesOrderLineInput, type ToolAssemblyInput, type WorkOrderInput, type WorkOrderUpdateInput } from '../services/shopService'
import { useAuth } from './AuthContext'

interface ShopValue {
  data: ShopData | null
  loading: boolean
  error: string | null
  notice: string | null
  lastEventId: string | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
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
  editWorkOrder: (input: WorkOrderUpdateInput) => Promise<void>
  markOrderMilestone: (salesOrderId: string, milestone: 'shipped' | 'invoiced') => Promise<void>
  saveRoutingTemplate: (input: RoutingTemplateInput) => Promise<void>
  setRoutingTemplateArchived: (templateId: string, archived: boolean) => Promise<void>
  addWorkOrder: (input: WorkOrderInput) => Promise<void>
  addProductionAdjustment: (input: { workOrderId: string; routingStepId: string; quantity: number }) => Promise<void>
  saveToolAssembly: (input: ToolAssemblyInput) => Promise<void>
  uploadToolAssemblyImage: (toolAssemblyId: string, organizationId: string, file: File) => Promise<void>
  removeToolAssemblyImage: (toolAssemblyId: string, currentImagePath: string | null) => Promise<void>
  setToolAssemblyArchived: (toolAssemblyId: string, archived: boolean) => Promise<void>
  recordToolCheckout: (input: { toolAssemblyId: string; transactionType: 'CHECK_OUT' | 'CHECK_IN'; note: string }) => Promise<void>
  saveWorkOrderOperationTools: (operationId: string, tooling: ToolingDraft[]) => Promise<void>
  clearNotice: () => void
}

const ShopContext = createContext<ShopValue | null>(null)

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the selected image.')))
    reader.addEventListener('error', () => reject(new Error('Unable to read the selected image.')))
    reader.readAsDataURL(file)
  })
}

function updateDemoCompletions(current: ShopData, productionEvents: ProductionEvent[]): ShopData {
  return refreshDemoToolStatus({
    ...current,
    productionEvents,
    workOrders: current.workOrders.map((workOrder) => {
      const metrics = calculateStepMetrics(workOrder, productionEvents)
      const final = metrics.at(-1)
      const complete = metrics.length > 0 && metrics.every((metric) => metric.available === 0) && (final?.transferred ?? 0) >= workOrder.quantityOrdered
      return { ...workOrder, completionDate: complete ? workOrder.completionDate ?? calendarDateInTimeZone(current.organization.plantTimezone) : null }
    }),
  })
}

function refreshDemoToolStatus(current: ShopData): ShopData {
  const usage = deriveToolUsage(current.workOrders, current.productionEvents)
  return {
    ...current,
    toolAssemblies: current.toolAssemblies.map((tool) => {
      const toolUsage = usage.get(tool.id) ?? { active: 0, future: 0 }
      return { ...tool, quantityCheckedOut: checkedOutQuantity(current.toolCheckoutTransactions, tool.id), quantityInUse: toolUsage.active, futureRequirements: toolUsage.future, usageWarning: toolUsage.active > 1 }
    }),
  }
}

function refreshDemoToolMasterReferences(current: ShopData, saved: ToolAssembly): ShopData {
  const applyMasterValues = <T extends { toolAssemblyId: string; toolAssemblyNumber: string; toolAssemblyName: string; toolAssemblyDescription: string }>(tool: T): T => tool.toolAssemblyId === saved.id
    ? { ...tool, toolAssemblyNumber: saved.assemblyNumber, toolAssemblyName: saved.name, toolAssemblyDescription: saved.description }
    : tool
  return {
    ...current,
    routingTemplates: current.routingTemplates.map((template) => ({ ...template, steps: template.steps.map((step) => ({ ...step, tooling: step.tooling?.map(applyMasterValues) })) })),
    workOrders: current.workOrders.map((workOrder) => ({ ...workOrder, operationTooling: workOrder.operationTooling?.map(applyMasterValues) })),
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const profileId = profile?.id ?? null
  const profileRole = profile?.role ?? null
  const profileScope = profile ? `${profile.id}:${profile.organizationId}:${profile.customerId ?? ''}:${profile.role}` : null
  const productionRoute = pathname.startsWith('/produce/')
  const [data, setData] = useState<ShopData | null>(env.demoMode ? refreshDemoToolStatus(structuredClone(demoData)) : null)
  const [loading, setLoading] = useState(!env.demoMode)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)
  const dataLimit = useRef(100)
  const pendingRequestIds = useRef(new Map<string, string>())
  const activeProfileScope = useRef(profileScope)

  const requestIdFor = (operation: string, input: unknown) => {
    const key = `${operation}:${JSON.stringify(input)}`
    const existing = pendingRequestIds.current.get(key)
    if (existing) return { key, requestId: existing }
    const requestId = crypto.randomUUID()
    pendingRequestIds.current.set(key, requestId)
    return { key, requestId }
  }

  const completeRequest = (key: string) => pendingRequestIds.current.delete(key)

  const refresh = useCallback(async () => {
    if (env.demoMode || productionRoute || !profileId || !profileRole) return
    setLoading(true)
    try { setData(await loadShopData(profileRole, dataLimit.current)); setError(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load shop data.') }
    finally { setLoading(false) }
  }, [productionRoute, profileId, profileRole])

  const loadMore = useCallback(async () => {
    if (env.demoMode || productionRoute || !profileId || !profileRole) return
    const nextLimit = dataLimit.current + 100
    setLoading(true)
    try {
      setData(await loadShopData(profileRole, nextLimit))
      dataLimit.current = nextLimit
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load more shop data.')
    } finally {
      setLoading(false)
    }
  }, [productionRoute, profileId, profileRole])

  useEffect(() => {
    const profileChanged = activeProfileScope.current !== profileScope
    activeProfileScope.current = profileScope

    if (profileChanged) {
      dataLimit.current = 100
      pendingRequestIds.current.clear()
      setError(null)
      setNotice(null)
      setLastEventId(null)
      setData(env.demoMode && profileScope ? structuredClone(demoData) : null)
    }

    if (env.demoMode) {
      setLoading(false)
      return
    }

    if (!profileScope) {
      setData(null)
      setLoading(false)
      return
    }

    if (productionRoute) {
      setLoading(false)
      return
    }

    void refresh()
  }, [productionRoute, profileScope, refresh])

  const transact: ShopValue['transact'] = async (input) => {
    if (!data || !profile) return
    const workOrder = data.workOrders.find((candidate) => candidate.id === input.workOrderId)
    if (workOrder?.archivedAt) throw new Error('Restore the work order before recording production.')
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (env.demoMode) {
      if (!workOrder) throw new Error('Work order not found or access denied.')
      const checkoutError = operationCheckoutError(workOrder, input.routingStepId, data.toolAssemblies)
      if (checkoutError) throw new Error(checkoutError)
      const event: ProductionEvent = {
        id: crypto.randomUUID(), organizationId: profile.organizationId, workOrderId: input.workOrderId,
        routingStepId: input.routingStepId, eventType: input.eventType, quantity: input.quantity,
        fromRoutingStepId: input.eventType === 'transfer' ? input.routingStepId : null,
        toRoutingStepId: input.eventType === 'transfer' ? input.toRoutingStepId : null,
        reversedEventId: null, actorId: profile.id, requestId: crypto.randomUUID(), createdAt: new Date().toISOString(),
      }
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, event]) : current)
      setLastEventId(event.id)
    } else {
      const request = requestIdFor('production-event', input)
      const event = await recordProductionEvent({ ...input, requestId: request.requestId })
      completeRequest(request.key)
      setLastEventId(event.id)
      await refresh()
    }
    setNotice(input.eventType === 'scrap' ? `Recorded ${input.quantity} scrap` : `Transferred ${input.quantity}`)
  }

  const undoLast = async () => {
    if (!lastEventId) return
    if (env.demoMode) {
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, {
        id: crypto.randomUUID(), organizationId: current.organization.id, workOrderId: current.productionEvents.find((event) => event.id === lastEventId)?.workOrderId ?? '', routingStepId: current.productionEvents.find((event) => event.id === lastEventId)?.routingStepId ?? '', eventType: 'reversal', quantity: current.productionEvents.find((event) => event.id === lastEventId)?.quantity ?? 0, fromRoutingStepId: null, toRoutingStepId: null, reversedEventId: lastEventId, actorId: profile?.id ?? null, requestId: null, createdAt: new Date().toISOString(),
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
    const order = input.salesOrderId ? data.salesOrders.find((candidate) => candidate.id === input.salesOrderId) : undefined
    if (order && salesOrderConversationLifecycle(order, data.workOrders, data.productionEvents, data.organization.plantTimezone).archived) {
      throw new Error('This conversation was archived seven days after the sales order closed.')
    }
    const message = plainTextQuestionMessage(input.message)
    const next: Question = { id: crypto.randomUUID(), organizationId: profile.organizationId, customerId: input.customerId, salesOrderId: input.salesOrderId, senderType: profile.role, senderName: profile.displayName, message, createdAt: new Date().toISOString(), readAt: null }
    if (env.demoMode) setData((current) => current ? { ...current, questions: appendQuestionReply(current.questions, next) } : current)
    else { await sendQuestion(next); await refresh() }
    setNotice('Message sent')
  }

  const addCustomer: ShopValue['addCustomer'] = async (input) => {
    const emailDomain = normalizeEmailDomain(input.emailDomain) || null
    if (env.demoMode) {
      setData((current) => current ? { ...current, customers: [...current.customers, { id: crypto.randomUUID(), organizationId: input.organizationId, customerName: input.customerName, logoUrl: input.logoUrl.trim() || null, emailDomain, primaryAddress: input.primaryAddress, defaultShipToAddress: input.shipToAddress, defaultBillToAddress: input.billToAddress }] } : current)
    } else { await createCustomer(input); await refresh() }
    setNotice('Customer created')
  }

  const editCustomer: ShopValue['editCustomer'] = async (customerId, input) => {
    const emailDomain = normalizeEmailDomain(input.emailDomain) || null
    if (env.demoMode) {
      setData((current) => current ? { ...current, customers: current.customers.map((customer) => customer.id === customerId ? { ...customer, customerName: input.customerName, logoUrl: input.logoUrl.trim() || null, emailDomain, primaryAddress: input.primaryAddress, defaultShipToAddress: input.shipToAddress, defaultBillToAddress: input.billToAddress } : customer) } : current)
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
    } else {
      const request = requestIdFor('create-sales-order', input)
      await createSalesOrder(input, request.requestId)
      completeRequest(request.key)
      await refresh()
    }
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
      const request = requestIdFor('add-sales-order-line', { salesOrderId, input })
      await addSalesOrderLineRecord(salesOrderId, input, request.requestId)
      completeRequest(request.key)
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

  const editWorkOrder: ShopValue['editWorkOrder'] = async (input) => {
    if (!data || profile?.role !== 'manufacturer') throw new Error('Only shop users can edit work orders.')
    const workOrder = data.workOrders.find((candidate) => candidate.id === input.workOrderId)
    if (!workOrder) throw new Error('Work order not found or access denied.')
    if (workOrder.archivedAt) throw new Error('Restore the work order before editing it.')
    if (!input.dueDate) throw new Error('Enter a due date.')
    if (input.routing.length < workOrder.routing.length) throw new Error('Existing routing steps cannot be removed.')
    if (input.routing.some((step) => !step.name.trim() || !step.customerStageName.trim())) throw new Error('Every routing step needs an internal step and customer stage.')

    const existingIds = new Set(workOrder.routing.map((step) => step.id))
    const submittedIds = new Set(input.routing.map((step) => step.id))
    if (submittedIds.size !== input.routing.length || workOrder.routing.some((step) => !submittedIds.has(step.id))) throw new Error('Every routing step requires a unique id and existing steps cannot be removed.')

    const metrics = calculateStepMetrics(workOrder, data.productionEvents)
    const submittedIndexById = new Map(input.routing.map((step, index) => [step.id, index]))
    for (const existing of workOrder.routing) {
      const submitted = input.routing.find((step) => step.id === existing.id)!
      const entered = Boolean(metrics.find((metric) => metric.stepId === existing.id)?.enteredAt)
      const changed = existing.routingStepName !== submitted.name.trim() || existing.customerStageName !== submitted.customerStageName.trim() || existing.workInstructions !== submitted.instructions
      if (entered && changed) throw new Error(`Routing step ${existing.sequenceNumber} has already been entered and cannot be changed.`)
      if (entered && submittedIndexById.get(existing.id) !== workOrder.routing.findIndex((step) => step.id === existing.id)) throw new Error('Routing steps that have received quantity cannot be reordered.')
    }

    const hasNewSteps = input.routing.some((step) => !existingIds.has(step.id))
    const hasFinalExit = (metrics.at(-1)?.transferred ?? 0) > 0
    if (hasNewSteps && workOrder.completionDate) throw new Error('Routing steps cannot be added to a completed work order.')
    if (hasNewSteps && hasFinalExit) throw new Error('Routing steps cannot be added after quantity has exited the final step.')

    if (env.demoMode) {
      setData((current) => current ? {
        ...current,
        workOrders: current.workOrders.map((candidate) => {
          if (candidate.id !== input.workOrderId) return candidate
          return {
            ...candidate,
            dueDate: input.dueDate,
            notes: input.notes,
            routing: input.routing.map((step, index) => {
              const existing = candidate.routing.find((routeStep) => routeStep.id === step.id)
              if (existing) return { ...existing, sequenceNumber: (index + 1) * 10, routingStepName: step.name.trim(), customerStageName: step.customerStageName.trim(), workInstructions: step.instructions }
              return { id: step.id, workOrderId: candidate.id, sequenceNumber: (index + 1) * 10, routingStepName: step.name.trim(), customerStageName: step.customerStageName.trim(), workInstructions: step.instructions, notes: '' }
            }),
          }
        }),
      } : current)
    } else {
      await updateWorkOrderRecord(input)
      await refresh()
    }
    setNotice('Work order updated')
  }

  const markOrderMilestone: ShopValue['markOrderMilestone'] = async (salesOrderId, milestone) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only manufacturer users can update order fulfillment.')
    if (data?.salesOrders.find((order) => order.id === salesOrderId)?.archivedAt) throw new Error('Restore the sales order before updating fulfillment.')
    if (env.demoMode) {
      const timestamp = new Date().toISOString()
      setData((current) => current ? {
        ...current,
        salesOrders: current.salesOrders.map((order) => order.id === salesOrderId
          ? { ...order, [milestone === 'shipped' ? 'shippedAt' : 'invoicedAt']: timestamp }
          : order),
      } : current)
    } else {
      const timestamp = await markSalesOrderMilestone(salesOrderId, milestone)
      setData((current) => current ? {
        ...current,
        salesOrders: current.salesOrders.map((order) => order.id === salesOrderId
          ? { ...order, [milestone === 'shipped' ? 'shippedAt' : 'invoicedAt']: timestamp }
          : order),
      } : current)
    }
    setNotice(milestone === 'shipped' ? 'Sales order marked shipped' : 'Sales order marked invoiced')
  }

  const saveRoutingTemplate: ShopValue['saveRoutingTemplate'] = async (input) => {
    if (profile?.role !== 'manufacturer' || input.organizationId !== profile.organizationId) throw new Error('Only shop users can save routing templates for their organization.')
    const templateName = input.templateName.trim()
    if (!templateName) throw new Error('Enter a template name.')
    if (input.steps.length === 0) throw new Error('Add at least one routing step.')
    if (input.steps.some((step) => !step.name.trim() || !step.customerStageName.trim())) throw new Error('Every routing step needs an internal step and customer stage.')
    for (const step of input.steps) { const toolingError = validateToolingDraft(step.tooling ?? []); if (toolingError) throw new Error(toolingError) }
    if (input.steps.some((step) => (step.tooling ?? []).some((tool) => data?.toolAssemblies.find((assembly) => assembly.id === tool.toolAssemblyId)?.archivedAt))) throw new Error('Replace archived tooling before saving routing defaults.')
    if (env.demoMode) {
      setData((current) => {
        if (!current) return current
        const existing = current.routingTemplates.find((template) => template.id === input.id)
        const saved = {
          id: input.id,
          organizationId: input.organizationId,
          templateName,
          archivedAt: existing?.archivedAt ?? null,
          steps: input.steps.map((step, index) => {
            const operationId = crypto.randomUUID()
            return { id: operationId, routingTemplateId: input.id, sequenceNumber: (index + 1) * 10, routingStepName: step.name.trim(), customerStageName: step.customerStageName.trim(), workInstructions: step.instructions, tooling: (step.tooling ?? []).map((tool, toolIndex) => { const assembly = current.toolAssemblies.find((candidate) => candidate.id === tool.toolAssemblyId)!; return { id: crypto.randomUUID(), routingOperationId: operationId, toolAssemblyId: tool.toolAssemblyId, toolAssemblyNumber: assembly.assemblyNumber, toolAssemblyName: assembly.name, toolAssemblyDescription: assembly.description, toolNumber: normalizeToolNumber(tool.toolNumber), sequenceNumber: (toolIndex + 1) * 10, notes: tool.notes } }) }
          }),
        }
        return { ...current, routingTemplates: existing ? current.routingTemplates.map((template) => template.id === input.id ? saved : template) : [...current.routingTemplates, saved] }
      })
    } else {
      await saveRoutingTemplateRecord({ ...input, templateName })
      await refresh()
    }
    setNotice('Routing template saved')
  }

  const setRoutingTemplateArchived: ShopValue['setRoutingTemplateArchived'] = async (templateId, archived) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only shop users can archive routing templates.')
    const archivedAt = archived ? new Date().toISOString() : null
    if (env.demoMode) setData((current) => current ? { ...current, routingTemplates: current.routingTemplates.map((template) => template.id === templateId ? { ...template, archivedAt } : template) } : current)
    else { await setRoutingTemplateArchivedRecord(templateId, archived); await refresh() }
    setNotice(archived ? 'Routing template archived' : 'Routing template restored')
  }

  const addWorkOrder: ShopValue['addWorkOrder'] = async (input) => {
    const salesOrder = data?.salesOrders.find((order) => order.id === input.salesOrderId)
    if (salesOrder?.archivedAt) throw new Error('Restore the sales order before creating work orders.')
    if (salesOrder?.lines.find((line) => line.id === input.salesOrderLineItemId)?.archivedAt) throw new Error('Restore the sales order line before creating work orders.')
    for (const step of input.routing) { const toolingError = validateToolingDraft((step.tooling ?? []).map((tool, index) => ({ key: tool.sourceRoutingOperationToolId ?? String(index), ...tool }))); if (toolingError) throw new Error(toolingError) }
    if (input.routing.some((step) => (step.tooling ?? []).some((tool) => data?.toolAssemblies.find((assembly) => assembly.id === tool.toolAssemblyId)?.archivedAt))) throw new Error('Archived tooling cannot be copied to a new Work Order.')
    if (env.demoMode) {
      const id = crypto.randomUUID()
      const firstStepId = crypto.randomUUID()
      const routing = input.routing.map((step, index) => ({ id: index === 0 ? firstStepId : crypto.randomUUID(), workOrderId: id, sequenceNumber: step.sequenceNumber, routingStepName: step.name, customerStageName: step.customerStageName, workInstructions: step.instructions, notes: '' }))
      const releasedAt = new Date().toISOString()
      setData((current) => {
        if (!current) return current
        const workOrderNumber = nextChronologicalNumber(current.workOrders.filter((workOrder) => workOrder.organizationId === input.organizationId).map((workOrder) => workOrder.workOrderNumber), 6)
        const workOrderName = input.workOrderName.trim() || workOrderNumber
        const operationTooling = input.routing.flatMap((step, index) => (step.tooling ?? []).map((tool, toolIndex) => { const assembly = current.toolAssemblies.find((candidate) => candidate.id === tool.toolAssemblyId)!; return { id: crypto.randomUUID(), workOrderOperationId: routing[index].id, toolAssemblyId: tool.toolAssemblyId, toolAssemblyNumber: assembly.assemblyNumber, toolAssemblyName: assembly.name, toolAssemblyDescription: assembly.description, toolNumber: normalizeToolNumber(tool.toolNumber), sequenceNumber: (toolIndex + 1) * 10, notes: tool.notes, sourceRoutingOperationToolId: tool.sourceRoutingOperationToolId } }))
        return refreshDemoToolStatus({ ...current, workOrders: [...current.workOrders, { id, organizationId: input.organizationId, workOrderNumber, workOrderName, salesOrderId: input.salesOrderId, salesOrderLineItemId: input.salesOrderLineItemId, partNumber: input.partNumber, quantityOrdered: input.quantityOrdered, dueDate: input.dueDate, releasedAt, completionDate: null, archivedAt: null, notes: input.notes, routing, operationTooling }], productionEvents: [...current.productionEvents, { id: crypto.randomUUID(), organizationId: input.organizationId, workOrderId: id, routingStepId: firstStepId, eventType: 'release', quantity: input.quantityOrdered, fromRoutingStepId: null, toRoutingStepId: firstStepId, reversedEventId: null, actorId: profile?.id ?? null, requestId: null, createdAt: releasedAt }] })
      })
    } else {
      const request = requestIdFor('create-work-order', input)
      await createWorkOrder(input, request.requestId)
      completeRequest(request.key)
      await refresh()
    }
    setNotice('Work order released')
  }

  const addProductionAdjustment: ShopValue['addProductionAdjustment'] = async (input) => {
    if (!data || !profile || !Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Enter a whole quantity greater than zero.')
    if (data.workOrders.find((workOrder) => workOrder.id === input.workOrderId)?.archivedAt) throw new Error('Restore the work order before recording production.')
    if (env.demoMode) {
      const event: ProductionEvent = { id: crypto.randomUUID(), organizationId: profile.organizationId, workOrderId: input.workOrderId, routingStepId: input.routingStepId, eventType: 'adjustment', quantity: input.quantity, fromRoutingStepId: null, toRoutingStepId: input.routingStepId, reversedEventId: null, actorId: profile.id, requestId: crypto.randomUUID(), createdAt: new Date().toISOString() }
      setData((current) => current ? updateDemoCompletions(current, [...current.productionEvents, event]) : current)
    } else {
      const request = requestIdFor('production-adjustment', input)
      await recordProductionAdjustment({ ...input, requestId: request.requestId })
      completeRequest(request.key)
      await refresh()
    }
    setNotice(`Added ${input.quantity} overrun piece${input.quantity === 1 ? '' : 's'}`)
  }

  const saveToolAssembly: ShopValue['saveToolAssembly'] = async (input) => {
    if (profile?.role !== 'manufacturer' || input.organizationId !== profile.organizationId) throw new Error('Only shop users can save tool assemblies for their organization.')
    if (env.demoMode) {
      setData((current) => {
        if (!current) return current
        const existing = current.toolAssemblies.find((tool) => tool.id === input.id)
        const timestamp = new Date().toISOString()
        const assemblyNumber = existing?.assemblyNumber ?? nextPrefixedChronologicalNumber(current.toolAssemblies.filter((tool) => tool.organizationId === input.organizationId).map((tool) => tool.assemblyNumber), 'TA-', 3)
        const saved = { id: input.id, organizationId: input.organizationId, assemblyNumber, name: input.name.trim() || assemblyNumber, description: input.description, quantityCheckedOut: existing?.quantityCheckedOut ?? 0, quantityInUse: existing?.quantityInUse ?? 0, futureRequirements: existing?.futureRequirements ?? 0, usageWarning: (existing?.quantityInUse ?? 0) > 1, imagePath: existing?.imagePath ?? null, imageUrl: existing?.imageUrl ?? null, archivedAt: existing?.archivedAt ?? null, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
        const withSavedAssembly = { ...current, toolAssemblies: existing ? current.toolAssemblies.map((tool) => tool.id === input.id ? saved : tool) : [...current.toolAssemblies, saved] }
        return refreshDemoToolStatus(refreshDemoToolMasterReferences(withSavedAssembly, saved))
      })
    } else { await saveToolAssemblyRecord(input); await refresh() }
    setNotice('Tool assembly saved')
  }

  const uploadToolAssemblyImage: ShopValue['uploadToolAssemblyImage'] = async (toolAssemblyId, organizationId, file) => {
    if (profile?.role !== 'manufacturer' || organizationId !== profile.organizationId) throw new Error('Only shop users can upload tool assembly images for their organization.')
    await validateToolAssemblyImage(file)
    if (env.demoMode) {
      const imageUrl = await readImageAsDataUrl(file)
      setData((current) => current ? { ...current, toolAssemblies: current.toolAssemblies.map((tool) => tool.id === toolAssemblyId ? { ...tool, imagePath: `demo/${toolAssemblyId}/${file.name}`, imageUrl, updatedAt: new Date().toISOString() } : tool) } : current)
    } else { await uploadToolAssemblyImageRecord({ toolAssemblyId, organizationId, file }); await refresh() }
    setNotice('Tool assembly image saved')
  }

  const removeToolAssemblyImage: ShopValue['removeToolAssemblyImage'] = async (toolAssemblyId, currentImagePath) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only shop users can remove tool assembly images.')
    if (env.demoMode) setData((current) => current ? { ...current, toolAssemblies: current.toolAssemblies.map((tool) => tool.id === toolAssemblyId ? { ...tool, imagePath: null, imageUrl: null, updatedAt: new Date().toISOString() } : tool) } : current)
    else { await removeToolAssemblyImageRecord(toolAssemblyId, currentImagePath); await refresh() }
    setNotice('Tool assembly image removed')
  }

  const setToolAssemblyArchived: ShopValue['setToolAssemblyArchived'] = async (toolAssemblyId, archived) => {
    if (profile?.role !== 'manufacturer') throw new Error('Only shop users can archive tool assemblies.')
    if (env.demoMode) setData((current) => current ? { ...current, toolAssemblies: current.toolAssemblies.map((tool) => tool.id === toolAssemblyId ? { ...tool, archivedAt: archived ? new Date().toISOString() : null } : tool) } : current)
    else { await setToolAssemblyArchivedRecord(toolAssemblyId, archived); await refresh() }
    setNotice(archived ? 'Tool assembly archived' : 'Tool assembly restored')
  }

  const recordToolCheckout: ShopValue['recordToolCheckout'] = async (input) => {
    if (!data || profile?.role !== 'manufacturer') throw new Error('Only shop users can check tooling in or out.')
    const tool = data.toolAssemblies.find((candidate) => candidate.id === input.toolAssemblyId)
    if (!tool) throw new Error('Tool assembly not found or access denied.')
    const validationError = validateCheckoutTransaction(tool.quantityCheckedOut, input.transactionType, tool.quantityInUse)
    if (validationError) throw new Error(validationError)
    if (env.demoMode) {
      setData((current) => current ? refreshDemoToolStatus({ ...current, toolCheckoutTransactions: [{ id: crypto.randomUUID(), organizationId: tool.organizationId, toolAssemblyId: tool.id, transactionType: input.transactionType, note: input.note, actorId: profile.id, actorDisplayName: profile.displayName, createdAt: new Date().toISOString() }, ...current.toolCheckoutTransactions] }) : current)
    } else {
      const request = requestIdFor('tool-checkout', input)
      await recordToolCheckoutRecord({ ...input, requestId: request.requestId })
      completeRequest(request.key)
      await refresh()
    }
    setNotice(input.transactionType === 'CHECK_OUT' ? 'Tooling checked out' : 'Tooling checked in')
  }

  const saveWorkOrderOperationTools: ShopValue['saveWorkOrderOperationTools'] = async (operationId, tooling) => {
    if (!data || profile?.role !== 'manufacturer') throw new Error('Only shop users can change Work Order tooling.')
    const toolingError = validateToolingDraft(tooling)
    if (toolingError) throw new Error(toolingError)
    const currentAssignments = data.workOrders.flatMap((workOrder) => workOrder.operationTooling ?? []).filter((tool) => tool.workOrderOperationId === operationId)
    if (tooling.some((draft) => data.toolAssemblies.find((assembly) => assembly.id === draft.toolAssemblyId)?.archivedAt
      && !currentAssignments.some((existing) => existing.id === draft.key && existing.toolAssemblyId === draft.toolAssemblyId))) throw new Error('Archived tooling cannot be newly assigned.')
    if (env.demoMode) {
      setData((current) => {
        if (!current) return current
        const workOrder = current.workOrders.find((candidate) => candidate.routing.some((step) => step.id === operationId))
        if (!workOrder || workOrder.archivedAt) throw new Error('Restore the work order before changing tooling.')
        const replacements = tooling.map((draft, index) => { const assembly = current.toolAssemblies.find((candidate) => candidate.id === draft.toolAssemblyId)!; return { id: draft.key, workOrderOperationId: operationId, toolAssemblyId: draft.toolAssemblyId, toolAssemblyNumber: assembly.assemblyNumber, toolAssemblyName: assembly.name, toolAssemblyDescription: assembly.description, toolNumber: normalizeToolNumber(draft.toolNumber), sequenceNumber: (index + 1) * 10, notes: draft.notes, sourceRoutingOperationToolId: draft.sourceRoutingOperationToolId ?? null } })
        return refreshDemoToolStatus({ ...current, workOrders: current.workOrders.map((candidate) => candidate.id === workOrder.id ? { ...candidate, operationTooling: [...(candidate.operationTooling ?? []).filter((tool) => tool.workOrderOperationId !== operationId), ...replacements] } : candidate) })
      })
    } else { await saveWorkOrderOperationToolsRecord(operationId, tooling); await refresh() }
    setNotice('Work Order tooling updated')
  }

  const value: ShopValue = { data, loading, error, notice, lastEventId, refresh, loadMore, transact, undoLast, addQuestion, addCustomer, editCustomer, addSalesOrder, addSalesOrderLine, editSalesOrderLine, setSalesOrderLineArchived, setSalesOrderArchived, setWorkOrderArchived, editWorkOrder, markOrderMilestone, saveRoutingTemplate, setRoutingTemplateArchived, addWorkOrder, addProductionAdjustment, saveToolAssembly, uploadToolAssemblyImage, removeToolAssemblyImage, setToolAssemblyArchived, recordToolCheckout, saveWorkOrderOperationTools, clearNotice: () => setNotice(null) }
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside ShopProvider')
  return value
}
