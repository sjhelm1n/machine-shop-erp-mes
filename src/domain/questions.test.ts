import { describe, expect, it } from 'vitest'
import { demoData } from '../data/demoData'
import { appendQuestionReply, archivedConversationOrderIds, plainTextQuestionMessage, salesOrderConversationLifecycle } from './questions'
import type { Question } from './types'

const customerQuestion: Question = {
  id: 'question-a', organizationId: 'org-a', customerId: 'customer-a', salesOrderId: 'order-a', senderType: 'customer', message: 'Question', createdAt: '2026-08-28T12:00:00Z', readAt: null,
}

describe('appendQuestionReply', () => {
  it('marks prior opposite-party messages in the same thread read', () => {
    const reply: Question = { ...customerQuestion, id: 'reply-a', senderType: 'manufacturer', message: 'Reply', createdAt: '2026-08-28T12:05:00Z' }
    const questions = appendQuestionReply([customerQuestion], reply)

    expect(questions[0].readAt).toBe(reply.createdAt)
    expect(questions[1]).toEqual(reply)
  })

  it('does not clear unread messages from another order thread', () => {
    const otherThread = { ...customerQuestion, id: 'question-b', salesOrderId: 'order-b' }
    const reply: Question = { ...customerQuestion, id: 'reply-a', senderType: 'manufacturer', message: 'Reply', createdAt: '2026-08-28T12:05:00Z' }
    const questions = appendQuestionReply([customerQuestion, otherThread], reply)

    expect(questions[0].readAt).toBe(reply.createdAt)
    expect(questions[1].readAt).toBeNull()
  })

  it('converts pasted markup to plain text and removes control characters', () => {
    expect(plainTextQuestionMessage('Status <b>please</b>\u0000\u0007')).toBe('Status please')
    expect(plainTextQuestionMessage('Data: received from inspection')).toBe('Data: received from inspection')
  })

  it.each([
    'https://example.com/order',
    'www.example.com',
    'example.org/order/1',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///tmp/report.exe',
  ])('rejects links and executable URI schemes: %s', (message) => {
    expect(() => plainTextQuestionMessage(message)).toThrow('Links and URLs are not allowed')
  })

  it('archives a completed sales-order conversation seven plant-calendar days after the last closing condition', () => {
    const data = structuredClone(demoData)
    const order = data.salesOrders.find((candidate) => candidate.id === 'so-1048')!
    const workOrder = data.workOrders.find((candidate) => candidate.salesOrderId === order.id)!
    order.shippedAt = '2026-08-04T02:30:00Z'
    order.invoicedAt = '2026-08-03T20:00:00Z'
    workOrder.customerProgressPercent = 100
    workOrder.completionDate = '2026-08-02'

    expect(salesOrderConversationLifecycle(order, data.workOrders, data.productionEvents, 'America/Detroit', '2026-08-09')).toEqual({
      closedDate: '2026-08-03',
      archiveDate: '2026-08-10',
      archived: false,
    })
    expect(salesOrderConversationLifecycle(order, data.workOrders, data.productionEvents, 'America/Detroit', '2026-08-10').archived).toBe(true)
    expect(archivedConversationOrderIds(data.salesOrders, data.workOrders, data.productionEvents, 'America/Detroit', '2026-08-10')).toContain(order.id)
  })

  it('keeps a conversation active until every sales-order completion condition is satisfied', () => {
    const data = structuredClone(demoData)
    const order = data.salesOrders.find((candidate) => candidate.id === 'so-1048')!
    const workOrder = data.workOrders.find((candidate) => candidate.salesOrderId === order.id)!
    order.shippedAt = '2026-08-01T16:00:00Z'
    order.invoicedAt = null
    workOrder.customerProgressPercent = 100
    workOrder.completionDate = '2026-08-01'

    expect(salesOrderConversationLifecycle(order, data.workOrders, data.productionEvents, 'America/Detroit', '2026-09-01')).toEqual({
      closedDate: null,
      archiveDate: null,
      archived: false,
    })
  })
})
