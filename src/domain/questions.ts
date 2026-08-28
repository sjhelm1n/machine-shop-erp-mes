import type { Question } from './types'

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
