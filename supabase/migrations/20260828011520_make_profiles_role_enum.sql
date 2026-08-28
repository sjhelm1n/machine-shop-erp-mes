create type public.profile_role as enum ('manufacturer', 'customer');

comment on type public.profile_role is
  'Application roles allowed for authenticated ShopCore profiles.';

-- This policy depends on profiles.role and compares it with the text-based
-- sender_type column, so recreate it after the column type conversion.
drop policy customer_messages_insert on public.customer_messages;

alter table public.profiles
  drop constraint profiles_role_check,
  drop constraint profiles_check;

alter table public.profiles
  alter column role type public.profile_role
  using role::public.profile_role;

alter table public.profiles
  add constraint profiles_check check (
    (role = 'manufacturer' and customer_id is null)
    or (role = 'customer' and customer_id is not null)
  );

create policy customer_messages_insert
  on public.customer_messages
  for insert
  to authenticated
  with check (
    (select private.can_access_customer(organization_id, customer_id))
    and sender_type = (
      select role::text
      from public.profiles
      where id = (select auth.uid())
    )
  );
