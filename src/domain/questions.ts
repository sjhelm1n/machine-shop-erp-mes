import type { ProductionEvent, Question, SalesOrder, WorkOrder } from './types'
import { salesOrderCompletion } from './routing'
import { addCalendarDays, calendarDateInTimeZone, sanitizePlainText } from '../lib/format'

const embeddedLinkPattern = /(?:\b(?:https?|ftp):\/\/|\bwww\.|\bjavascript\s*:|\bdata\s*:\s*[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+|\bfile\s*:\s*\/{1,3}|\b[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:[/?#:][^\s]*)?)/iu

function stripControlCharacters(value: string): string {
  return [...value].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint === 9 || codePoint === 10 || codePoint === 13 || (codePoint >= 32 && codePoint !== 127)
  }).join('')
}

export function plainTextQuestionMessage(value: string): string {
  const normalized = stripControlCharacters(value.normalize('NFKC'))

  if (embeddedLinkPattern.test(normalized)) throw new Error('Links and URLs are not allowed in messages.')

  const message = sanitizePlainText(normalized)
  if (!message) throw new Error('Enter a plain-text message.')
  return message
}

export interface ConversationLifecycle {
  closedDate: string | null
  archiveDate: string | null
  archived: boolean
}

export function salesOrderConversationLifecycle(
  order: SalesOrder | undefined,
  workOrders: WorkOrder[],
  events: ProductionEvent[],
  plantTimezone: string,
  currentDate = calendarDateInTimeZone(plantTimezone),
): ConversationLifecycle {
  if (!order || !salesOrderCompletion(order, workOrders, events).completed) {
    return { closedDate: null, archiveDate: null, archived: false }
  }

  const relatedWorkOrders = workOrders.filter((workOrder) => workOrder.salesOrderId === order.id && !workOrder.archivedAt)
  const closingDates = [
    order.shippedAt ? calendarDateInTimeZone(plantTimezone, new Date(order.shippedAt)) : null,
    order.invoicedAt ? calendarDateInTimeZone(plantTimezone, new Date(order.invoicedAt)) : null,
    ...relatedWorkOrders.map((workOrder) => workOrder.completionDate),
  ].filter((date): date is string => Boolean(date))
  const closedDate = closingDates.sort().at(-1) ?? null
  if (!closedDate) return { closedDate: null, archiveDate: null, archived: false }

  const archiveDate = addCalendarDays(closedDate, 7)
  return { closedDate, archiveDate, archived: currentDate >= archiveDate }
}

export function archivedConversationOrderIds(
  orders: SalesOrder[],
  workOrders: WorkOrder[],
  events: ProductionEvent[],
  plantTimezone: string,
  currentDate = calendarDateInTimeZone(plantTimezone),
): Set<string> {
  return new Set(orders.flatMap((order) => salesOrderConversationLifecycle(order, workOrders, events, plantTimezone, currentDate).archived ? [order.id] : []))
}

export function appendQuestionReply(questions: Question[], reply: Question): Question[] {
  return [
    ...questions.map((question) => question.organizationId === reply.organizationId
      && question.customerId === reply.customerId
      && question.salesOrderId === reply.salesOrderId
      && question.senderType !== reply.senderType
      && question.readAt === null
      && question.createdAt <= reply.createdAt
      ? { ...question, readAt: reply.createdAt }
      : question),
    reply,
  ]
}
