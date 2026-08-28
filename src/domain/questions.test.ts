import { describe, expect, it } from 'vitest'
import { appendQuestionReply } from './questions'
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
})
