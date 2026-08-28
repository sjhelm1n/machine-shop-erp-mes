alter table public.customers
  add column logo_url text;

alter table public.customers
  add constraint customers_logo_url_https_check
  check (
    logo_url is null
    or (
      char_length(logo_url) between 1 and 2048
      and logo_url ~* '^https://[^[:space:]]+$'
    )
  );

comment on column public.customers.logo_url is
  'Optional HTTPS URL for the customer logo shown in manufacturer-facing customer tiles.';
