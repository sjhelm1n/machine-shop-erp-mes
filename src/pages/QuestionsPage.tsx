import { CheckCheck, MessageSquare, Plus, Send } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, EmptyState, Modal, PageHeader } from '../components/Ui'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/ShopContext'
import { archivedConversationOrderIds } from '../domain/questions'
import { formatDateTime } from '../lib/format'

type ConversationFilter = 'active' | 'archived'

export function QuestionsPage() {
  const { data, loading, loadMore, addQuestion } = useShop()
  const { profile } = useAuth()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newQuestionOpen, setNewQuestionOpen] = useState(false)
  const [newOrderId, setNewOrderId] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newBusy, setNewBusy] = useState(false)
  const [newError, setNewError] = useState('')
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('active')

  const accessible = useMemo(
    () => data?.questions.filter((question) => profile?.role === 'manufacturer' || question.customerId === profile?.customerId) ?? [],
    [data, profile?.customerId, profile?.role],
  )
  const archivedOrderIds = useMemo(
    () => data ? archivedConversationOrderIds(data.salesOrders, data.workOrders, data.productionEvents, data.organization.plantTimezone) : new Set<string>(),
    [data],
  )
  const allThreadKeys = [...new Set(accessible.map((question) => question.salesOrderId ?? `customer:${question.customerId}`))]
  const activeThreadKeys = allThreadKeys.filter((key) => !archivedOrderIds.has(key))
  const archivedThreadKeys = allThreadKeys.filter((key) => archivedOrderIds.has(key))
  const threadKeys = conversationFilter === 'active' ? activeThreadKeys : archivedThreadKeys
  const activeKey = selectedKey && threadKeys.includes(selectedKey) ? selectedKey : threadKeys[0] ?? null
  const selectedMessages = accessible.filter((question) => (question.salesOrderId ?? `customer:${question.customerId}`) === activeKey)
  const selectedOrder = data?.salesOrders.find((order) => order.id === activeKey)
  const customerId = selectedOrder?.customerId ?? selectedMessages[0]?.customerId ?? profile?.customerId
  const customerOrders = data?.salesOrders.filter((order) => order.customerId === profile?.customerId && !archivedOrderIds.has(order.id)) ?? []

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!customerId) return
    setBusy(true)
    setError('')
    try {
      await addQuestion({ customerId, salesOrderId: selectedOrder?.id ?? null, message })
      setMessage('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send message.')
    } finally {
      setBusy(false)
    }
  }

  const startQuestion = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile?.customerId || !newOrderId) return
    setNewBusy(true)
    setNewError('')
    try {
      await addQuestion({ customerId: profile.customerId, salesOrderId: newOrderId, message: newMessage })
      setConversationFilter('active')
      setSelectedKey(newOrderId)
      setNewMessage('')
      setNewQuestionOpen(false)
    } catch (reason) {
      setNewError(reason instanceof Error ? reason.message : 'Unable to send message.')
    } finally {
      setNewBusy(false)
    }
  }

  const openNewQuestion = () => {
    setNewOrderId(customerOrders[0]?.id ?? '')
    setNewMessage('')
    setNewError('')
    setNewQuestionOpen(true)
  }

  if (!data) return null

  return <main className="page messages-page">
    <PageHeader
      eyebrow="Order-linked Q&A"
      title={profile?.role === 'customer' ? 'Questions' : 'Customer questions'}
      description="Plain-text conversations tied to accepted orders."
      action={profile?.role === 'customer' && customerOrders.length > 0 ? <Button onClick={openNewQuestion}><Plus size={16} /> Ask a question</Button> : undefined}
    />
    <div className="toolbar"><div className="segmented" aria-label="Conversation status"><button className={conversationFilter === 'active' ? 'active' : ''} onClick={() => setConversationFilter('active')}>Active ({activeThreadKeys.length})</button><button className={conversationFilter === 'archived' ? 'active' : ''} onClick={() => setConversationFilter('archived')}>Archived ({archivedThreadKeys.length})</button></div></div>
    {threadKeys.length === 0 ? <EmptyState title={conversationFilter === 'archived' ? 'No archived conversations' : 'No active conversations'} body={conversationFilter === 'archived' ? 'Conversations appear here seven days after their completed sales order closes.' : profile?.role === 'customer' ? 'Use “Ask a question” to contact the shop about an accepted order.' : 'Order-related questions will appear here.'} /> : <section className="messages-shell">
      <aside className="thread-list">{threadKeys.map((key) => {
        const messages = accessible.filter((question) => (question.salesOrderId ?? `customer:${question.customerId}`) === key)
        const latest = messages.at(-1)!
        const order = data?.salesOrders.find((candidate) => candidate.id === key)
        const customer = data?.customers.find((candidate) => candidate.id === latest.customerId)
        const unread = messages.some((question) => question.senderType !== profile?.role && !question.readAt)
        return <button className={activeKey === key ? 'active' : ''} onClick={() => setSelectedKey(key)} key={key}><div className="thread-avatar"><MessageSquare size={17} /></div><div><strong>{profile?.role === 'manufacturer' ? customer?.customerName : order?.salesOrderName ?? 'General question'}</strong><span>{order ? `${order.salesOrderName} · PO ${order.customerPoNumber}` : 'General question'}</span><p>{latest.message}</p></div>{unread && <i />}</button>
      })}</aside>
      <div className="conversation"><header><div><strong>{profile?.role === 'manufacturer' ? data?.customers.find((customer) => customer.id === customerId)?.customerName : selectedOrder?.salesOrderName}</strong><span>{selectedOrder ? `${selectedOrder.salesOrderName} · PO ${selectedOrder.customerPoNumber}` : 'General question'}</span></div></header><div className="message-stream">{selectedMessages.map((question) => {
        const own = question.senderType === profile?.role
        return <div className={`message-bubble ${own ? 'own' : ''}`} key={question.id}><strong className="message-sender">{question.senderName}</strong><span>{question.message}</span><small>{formatDateTime(question.createdAt, data.organization.plantTimezone)} {own && <CheckCheck size={13} />}</small></div>
      })}</div>{conversationFilter === 'archived' ? <div className="report-empty">Archived conversations are read-only.</div> : <form className="message-compose" onSubmit={submit}><textarea aria-label="Message" rows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Plain text only—no links or attachments…" maxLength={2000} required /><Button disabled={busy || !message.trim()} aria-label="Send message"><Send size={18} /></Button>{error && <p className="form-error">{error}</p>}</form>}</div>
    </section>}
    {data?.pageInfo?.questionsHasMore && <div className="form-actions"><Button variant="secondary" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load 100 older messages'}</Button></div>}
    {newQuestionOpen && <Modal title="Ask about an order" onClose={() => setNewQuestionOpen(false)}><form className="entity-form" onSubmit={startQuestion}>
      <label className="full">Sales order<select value={newOrderId} onChange={(event) => setNewOrderId(event.target.value)} required>{customerOrders.map((order) => <option value={order.id} key={order.id}>{order.salesOrderName} · PO {order.customerPoNumber}</option>)}</select></label>
      <label className="full">Question<textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} maxLength={2000} rows={5} placeholder="Plain text only—no links or attachments." required /></label>
      {newError && <p className="form-error full">{newError}</p>}
      <div className="form-actions full"><Button type="button" variant="ghost" onClick={() => setNewQuestionOpen(false)}>Cancel</Button><Button disabled={newBusy || !newOrderId || !newMessage.trim()}>{newBusy ? 'Sending…' : 'Send question'}</Button></div>
    </form></Modal>}
  </main>
}
