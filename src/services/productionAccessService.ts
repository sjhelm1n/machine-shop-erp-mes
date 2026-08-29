import { parseProductionEvent, parseProductionStepSnapshot } from '../domain/databaseValidation'
import type { ProductionEvent, ProductionStepSnapshot } from '../domain/types'
import { requireSupabase } from '../lib/supabase'

const deviceStorageKey = 'shopcore.production-device.v1'
const sessionStorageKey = 'shopcore.production-session.v1'

export type ProductionAccessState = 'pending' | 'network_pending' | 'needs_pin' | 'locked' | 'ready'

export interface ProductionDeviceCredential {
  deviceId: string
  credential: string
}

export interface ProductionAccessStatus {
  state: ProductionAccessState
  deviceId: string
  operatorName?: string
}

export interface ManagedProductionDevice {
  id: string
  deviceName: string
  assignedOperatorId: string | null
  approvedAt: string | null
  createdAt: string
  expiresAt: string
  lastSeenAt: string | null
  networkChangePending: boolean
  revokedAt: string | null
}

export interface ProductionOperatorOption {
  id: string
  displayName: string
  email: string
  active: boolean
  hasPin: boolean
}

interface StoredSession { deviceId: string; session: string }

async function invoke<T>(body: object): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke('production-access', { body })
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

function readJson<T>(key: string): T | null {
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') as T | null } catch { return null }
}

export function loadProductionDevice(): ProductionDeviceCredential | null {
  const value = readJson<ProductionDeviceCredential>(deviceStorageKey)
  return value?.deviceId && value.credential ? value : null
}

export function loadProductionSession(deviceId: string): string | null {
  const value = readJson<StoredSession>(sessionStorageKey)
  return value?.deviceId === deviceId && value.session ? value.session : null
}

function saveDevice(value: ProductionDeviceCredential) {
  window.localStorage.setItem(deviceStorageKey, JSON.stringify(value))
}

function saveSession(deviceId: string, session: string) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify({ deviceId, session }))
}

export function clearProductionSession() {
  window.localStorage.removeItem(sessionStorageKey)
}

export function clearProductionDevice() {
  window.localStorage.removeItem(deviceStorageKey)
  clearProductionSession()
}

function productionDeviceName(): string {
  const userAgent = navigator.userAgent
  const device = /iPhone/i.test(userAgent) ? 'iPhone' : /iPad/i.test(userAgent) ? 'iPad' : /Android/i.test(userAgent) ? 'Android device' : 'Production device'
  const browser = /Edg\//i.test(userAgent) ? 'Edge' : /CriOS|Chrome/i.test(userAgent) ? 'Chrome' : /FxiOS|Firefox/i.test(userAgent) ? 'Firefox' : /Safari/i.test(userAgent) ? 'Safari' : 'Browser'
  return `${device} · ${browser}`
}

export async function registerProductionDevice(workOrderId: string): Promise<ProductionDeviceCredential> {
  const response = await invoke<ProductionAccessStatus & { credential: string }>({
    action: 'register',
    workOrderId,
    deviceName: productionDeviceName(),
  })
  const credential = { deviceId: response.deviceId, credential: response.credential }
  saveDevice(credential)
  return credential
}

export async function productionAccessStatus(device: ProductionDeviceCredential): Promise<ProductionAccessStatus> {
  return invoke<ProductionAccessStatus>({ action: 'status', ...device, session: loadProductionSession(device.deviceId) })
}

export async function setProductionPin(device: ProductionDeviceCredential, pin: string): Promise<void> {
  await invoke({ action: 'set_pin', ...device, pin })
}

export async function unlockProduction(device: ProductionDeviceCredential, pin: string): Promise<void> {
  const response = await invoke<{ session: string }>({ action: 'unlock', ...device, pin })
  saveSession(device.deviceId, response.session)
}

function stationCredentials(device: ProductionDeviceCredential) {
  const session = loadProductionSession(device.deviceId)
  if (!session) throw new Error('Enter your production PIN to continue.')
  return { ...device, session }
}

export async function loadStationProductionStep(device: ProductionDeviceCredential, workOrderId: string, routingStepId: string): Promise<ProductionStepSnapshot> {
  const response = await invoke<{ snapshot: unknown }>({ action: 'snapshot', ...stationCredentials(device), workOrderId, routingStepId })
  return parseProductionStepSnapshot(response.snapshot)
}

export async function recordStationProductionEvent(device: ProductionDeviceCredential, input: { workOrderId: string; routingStepId: string; eventType: 'transfer' | 'scrap'; quantity: number; toRoutingStepId?: string | null; requestId: string }): Promise<ProductionEvent> {
  const response = await invoke<{ event: unknown }>({ action: 'record', ...stationCredentials(device), ...input })
  return parseProductionEvent(response.event)
}

export async function reverseStationProductionEvent(device: ProductionDeviceCredential, eventId: string): Promise<void> {
  await invoke({ action: 'reverse', ...stationCredentials(device), eventId })
}

interface AdminListResponse {
  devices: Array<{ id: string; device_name: string; assigned_operator_id: string | null; approved_at: string | null; created_at: string; expires_at: string; last_seen_at: string | null; pending_network_hash: string | null; revoked_at: string | null }>
  operators: Array<{ id: string; display_name: string; email: string; activated_at: string | null }>
  pinOperatorIds: string[]
}

export async function loadProductionAccessAdmin(): Promise<{ devices: ManagedProductionDevice[]; operators: ProductionOperatorOption[] }> {
  const response = await invoke<AdminListResponse>({ action: 'admin_list' })
  const pins = new Set(response.pinOperatorIds)
  return {
    devices: response.devices.map((device) => ({ id: device.id, deviceName: device.device_name, assignedOperatorId: device.assigned_operator_id, approvedAt: device.approved_at, createdAt: device.created_at, expiresAt: device.expires_at, lastSeenAt: device.last_seen_at, networkChangePending: Boolean(device.pending_network_hash), revokedAt: device.revoked_at })),
    operators: response.operators.map((operator) => ({ id: operator.id, displayName: operator.display_name, email: operator.email, active: Boolean(operator.activated_at), hasPin: pins.has(operator.id) })),
  }
}

export async function manageProductionDevice(action: 'approve' | 'approve_network' | 'revoke', deviceId: string, operatorId?: string): Promise<void> {
  await invoke({ action, deviceId, operatorId })
}

export async function resetProductionPin(operatorId: string): Promise<void> {
  await invoke({ action: 'reset_pin', operatorId })
}
