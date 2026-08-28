create or replace function private.mark_customer_message_thread_read()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.customer_messages
  set read_at = new.created_at
  where organization_id = new.organization_id
    and customer_id = new.customer_id
    and sales_order_id is not distinct from new.sales_order_id
    and sender_type <> new.sender_type
    and read_at is null
    and created_at <= new.created_at;

  return new;
end;
$$;

revoke all on function private.mark_customer_message_thread_read() from public, anon, authenticated;

drop trigger if exists customer_messages_mark_thread_read on public.customer_messages;
create trigger customer_messages_mark_thread_read
after insert on public.customer_messages
for each row execute function private.mark_customer_message_thread_read();

-- Clear notifications already stuck on threads that received a later reply
-- before this trigger existed.
update public.customer_messages original
set read_at = (
  select min(reply.created_at)
  from public.customer_messages reply
  where reply.organization_id = original.organization_id
    and reply.customer_id = original.customer_id
    and reply.sales_order_id is not distinct from original.sales_order_id
    and reply.sender_type <> original.sender_type
    and reply.created_at > original.created_at
)
where original.read_at is null
  and exists (
    select 1
    from public.customer_messages reply
    where reply.organization_id = original.organization_id
      and reply.customer_id = original.customer_id
      and reply.sales_order_id is not distinct from original.sales_order_id
      and reply.sender_type <> original.sender_type
      and reply.created_at > original.created_at
  );

comment on function private.mark_customer_message_thread_read() is
  'When a reply is inserted, atomically marks earlier unread messages from the other party in the same customer/order thread as read.';
