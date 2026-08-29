-- Make the invitation table's no-direct-access contract explicit and cover its
-- tenant-scoped customer foreign key for customer deletion/update checks.

create policy user_invitations_no_direct_access
on public.user_invitations
for all
to authenticated
using (false)
with check (false);

create index user_invitations_customer_organization_idx
  on public.user_invitations(customer_id, organization_id);
