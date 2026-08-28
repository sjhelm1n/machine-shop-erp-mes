create type public.customer_document_type as enum ('customer_po', 'invoice', 'drawing', 'other');

alter table public.invoices rename to customer_documents;
alter table public.customer_documents rename column invoice_number to document_name;
alter table public.customer_documents rename column invoice_date to document_date;

alter table public.customer_documents
  add column document_type public.customer_document_type not null default 'invoice',
  add column upload_attestation_version text,
  add column upload_attested_at timestamptz,
  add constraint customer_documents_document_name_check check (length(trim(document_name)) between 1 and 200),
  add constraint customer_documents_upload_attestation_check check (
    (upload_attestation_version is null and upload_attested_at is null)
    or (length(trim(upload_attestation_version)) > 0 and upload_attested_at is not null)
  );

alter table public.customer_documents
  drop constraint invoices_organization_id_invoice_number_key;

alter table public.customer_documents rename constraint invoices_pkey to customer_documents_pkey;
alter table public.customer_documents rename constraint invoices_file_path_key to customer_documents_file_path_key;
alter table public.customer_documents rename constraint invoices_file_path_check to customer_documents_file_path_check;
alter table public.customer_documents rename constraint invoices_amount_check to customer_documents_amount_check;
alter table public.customer_documents rename constraint invoices_organization_id_fkey to customer_documents_organization_id_fkey;
alter table public.customer_documents rename constraint invoices_customer_id_fkey to customer_documents_customer_id_fkey;
alter table public.customer_documents rename constraint invoices_sales_order_id_fkey to customer_documents_sales_order_id_fkey;
alter table public.customer_documents rename constraint invoices_customer_id_organization_id_fkey to customer_documents_customer_id_organization_id_fkey;
alter table public.customer_documents rename constraint invoices_sales_order_id_customer_id_organization_id_fkey to customer_documents_sales_order_id_customer_id_organization_id_fkey;

alter index public.invoices_customer_date_idx rename to customer_documents_customer_date_idx;
alter index public.invoices_organization_id_idx rename to customer_documents_organization_id_idx;
alter index public.invoices_sales_order_id_idx rename to customer_documents_sales_order_id_idx;
alter index public.invoices_uploaded_by_idx rename to customer_documents_uploaded_by_idx;

alter policy invoices_select on public.customer_documents rename to customer_documents_select;
drop policy invoices_insert on public.customer_documents;
create policy customer_documents_insert
on public.customer_documents
for insert
to authenticated
with check (
  (select private.is_manufacturer(organization_id))
  and upload_attestation_version = 'manufacturer-document-upload-v1'
  and upload_attested_at is not null
);

comment on table public.customer_documents is
  'Manufacturer-uploaded customer-facing PDF references. QuickBooks remains the accounting system of record.';
comment on column public.customer_documents.document_type is
  'Customer PO, invoice reference, drawing, or another manufacturer-approved customer document.';
comment on column public.customer_documents.upload_attestation_version is
  'Version of the manufacturer upload attestation accepted for this document.';
comment on column public.customer_documents.upload_attested_at is
  'When the manufacturer confirmed authorization, customer assignment, and prohibited-content terms.';
comment on column public.customer_documents.amount is
  'Optional reference amount used for invoice documents only; QuickBooks remains authoritative.';
