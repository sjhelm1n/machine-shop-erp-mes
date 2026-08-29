-- Preserve released single-row insert contracts while database triggers enforce provenance.
grant insert on public.customer_messages to authenticated;
grant insert on public.customer_documents to authenticated;

comment on function private.enforce_message_provenance() is
  'FROZEN provenance boundary: authenticated inserts remain compatible, while actor and timestamps are always assigned by PostgreSQL.';
comment on function private.enforce_document_provenance() is
  'FROZEN provenance boundary: authenticated inserts remain compatible, while uploader, timestamps, attestation, and scoped path are enforced by PostgreSQL.';
