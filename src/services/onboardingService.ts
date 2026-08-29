import { requireSupabase } from '../lib/supabase'

export interface OnboardingStatus {
  organizationName: string
  accountClaimName: string
  plantTimezone: string
  accountEmailDomain: string | null
  completedAt: string | null
}

export async function signUpShopOwner(email: string, password: string, companyName: string) {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/confirm?next=/finish-account`,
      // Auth user metadata is only a cross-email-verification prefill. The
      // trusted claim RPC validates and reserves the submitted company name.
      data: { company_name: companyName },
    },
  })
  if (error) throw error
  return data
}

export async function claimShopAccount(input: { displayName: string; organizationName: string; plantTimezone: string }) {
  const { data, error } = await requireSupabase().rpc('claim_shop_account', {
    p_display_name: input.displayName.trim(),
    p_organization_name: input.organizationName.trim(),
    p_plant_timezone: input.plantTimezone,
  })
  if (error) throw error
  return data
}

export async function loadOnboardingStatus(): Promise<OnboardingStatus> {
  const { data, error } = await requireSupabase()
    .from('organizations')
    .select('name, account_claim_name, plant_timezone, account_email_domain, onboarding_completed_at')
    .single()
  if (error) throw error
  return {
    organizationName: data.name,
    accountClaimName: data.account_claim_name,
    plantTimezone: data.plant_timezone,
    accountEmailDomain: data.account_email_domain,
    completedAt: data.onboarding_completed_at,
  }
}

export async function completeOrganizationOnboarding(input: { organizationName: string; plantTimezone: string }) {
  const { data, error } = await requireSupabase().rpc('complete_my_organization_onboarding', {
    p_organization_name: input.organizationName.trim(),
    p_plant_timezone: input.plantTimezone,
  })
  if (error) throw error
  return data
}
