alter table public.customer_documents
  alter column upload_attested_at set default now();

comment on column public.customer_documents.upload_attested_at is
  'Server-recorded time when the manufacturer confirmed authorization, customer assignment, and prohibited-content terms.';
