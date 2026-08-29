import type { AppRole } from '../domain/types'
import type { ManageableCustomer, ManagedUser } from '../domain/userManagement'
import { requireSupabase } from '../lib/supabase'

interface ManagedUserRow {
  id: string
  organization_id: string
  customer_id: string | null
  email: string
  display_name: string
  position: string | null
  role: AppRole
  is_super_admin: boolean
  invited_at: string | null
  activated_at: string | null
}

interface ManageableCustomerRow {
  id: string
  customer_name: string
  portal_email_domain: string | null
}

interface UserListResponse {
  users: ManagedUserRow[]
  customers: ManageableCustomerRow[]
}

interface MutationResponse {
  ok: boolean
  authCleanupPending?: boolean
}

async function invoke<T>(body: object): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke('manage-users', { body })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response) {
      try {
        const detail = await response.clone().json() as { error?: string }
        if (detail.error) throw new Error(detail.error)
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason
      }
    }
    throw error
  }
  return data as T
}

export async function loadManagedUsers(): Promise<{ users: ManagedUser[]; customers: ManageableCustomer[] }> {
  const response = await invoke<UserListResponse>({ action: 'list' })
  return {
    users: response.users.map((user) => ({
      id: user.id,
      organizationId: user.organization_id,
      customerId: user.customer_id,
      email: user.email,
      displayName: user.display_name,
      position: user.position,
      role: user.role,
      isSuperAdmin: user.is_super_admin,
      invitedAt: user.invited_at,
      activatedAt: user.activated_at,
    })),
    customers: response.customers.map((customer) => ({
      id: customer.id,
      customerName: customer.customer_name,
      emailDomain: customer.portal_email_domain,
    })),
  }
}

export async function inviteManagedUser(input: {
  email: string
  displayName: string
  position: string | null
  role: AppRole
  customerId: string | null
}): Promise<void> {
  await invoke<MutationResponse>({
    action: 'invite',
    ...input,
    redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
  })
}

export async function removeManagedUser(userId: string): Promise<{ authCleanupPending: boolean }> {
  const response = await invoke<MutationResponse>({ action: 'remove', userId })
  return { authCleanupPending: response.authCleanupPending === true }
}

export async function activateCurrentProfile(): Promise<void> {
  await invoke<MutationResponse>({ action: 'activate' })
}
