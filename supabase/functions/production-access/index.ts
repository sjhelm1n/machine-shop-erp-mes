import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonObject = Record<string, unknown>;
type DeviceRow = {
  id: string;
  organization_id: string;
  device_name: string;
  credential_hash: string;
  network_hash: string;
  pending_network_hash: string | null;
  assigned_operator_id: string | null;
  approved_at: string | null;
  expires_at: string;
  failed_attempts: number;
  locked_until: string | null;
  revoked_at: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: JsonObject, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function messageFor(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string") return reason.message;
  return "Unable to authorize this production device.";
}

function requiredString(body: JsonObject, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function pinHash(pin: string, salt: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(`${pin}:${secret}`), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 120_000 }, material, 256));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function observedNetwork(req: Request): string {
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

function deviceName(value: unknown): string {
  if (typeof value !== "string") return "Production phone";
  const clean = value.replace(/[<>]/g, "").trim();
  return clean.slice(0, 120) || "Production phone";
}

async function authorizedDevice(admin: SupabaseClient, body: JsonObject, secret: string, networkHash: string): Promise<DeviceRow> {
  const deviceId = requiredString(body, "deviceId");
  const credential = requiredString(body, "credential");
  const credentialHash = await hmac(secret, `device:${credential}`);
  const { data, error } = await admin.from("production_devices").select("*").eq("id", deviceId).maybeSingle();
  if (error) throw error;
  const device = data as DeviceRow | null;
  if (!device || !safeEqual(device.credential_hash, credentialHash)) throw new Error("This device registration is invalid.");
  if (device.revoked_at) throw new Error("This production device has been revoked.");
  if (new Date(device.expires_at).getTime() <= Date.now()) throw new Error("This production device registration has expired.");
  if (!safeEqual(device.network_hash, networkHash)) {
    await admin.from("production_devices").update({ pending_network_hash: networkHash }).eq("id", device.id);
    throw new Error("This device is on a different network. Ask a super admin to approve the network change.");
  }
  if (!device.approved_at || !device.assigned_operator_id) throw new Error("This device is waiting for super admin approval.");
  await admin.from("production_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return device;
}

async function activeSession(admin: SupabaseClient, body: JsonObject, secret: string, networkHash: string) {
  const device = await authorizedDevice(admin, body, secret, networkHash);
  const session = requiredString(body, "session");
  const sessionHash = await hmac(secret, `session:${session}`);
  const { data, error } = await admin.from("production_device_sessions").select("*")
    .eq("session_hash", sessionHash).eq("device_id", device.id).eq("operator_id", device.assigned_operator_id)
    .is("revoked_at", null).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() <= Date.now() || new Date(data.last_seen_at).getTime() <= Date.now() - 30 * 60_000) {
    throw new Error("Your production session has expired. Enter your PIN again.");
  }
  await admin.from("production_device_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { device, operatorId: device.assigned_operator_id! };
}

async function requireSuperAdmin(req: Request, admin: SupabaseClient) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Sign in as a super admin.");
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) throw new Error("Your super admin session is invalid.");
  const { data: profile, error } = await admin.from("profiles")
    .select("id, organization_id, role, is_super_admin, activated_at")
    .eq("id", auth.user.id).maybeSingle();
  if (error) throw error;
  if (!profile || profile.role !== "manufacturer" || !profile.is_super_admin || !profile.activated_at) throw new Error("Super admin access is required.");
  return profile as { id: string; organization_id: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!url || !serviceKey) return response({ error: "Production access is not configured." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const secret = Deno.env.get("SHOPCORE_PRODUCTION_PEPPER") ?? serviceKey;
  const networkHash = await hmac(secret, `network:${observedNetwork(req)}`);

  let body: JsonObject;
  try {
    body = await req.json() as JsonObject;
  } catch {
    return response({ error: "A JSON request body is required." }, 400);
  }

  try {
    const action = requiredString(body, "action");
    if (action === "register") {
      const workOrderId = requiredString(body, "workOrderId");
      const { data: workOrder, error } = await admin.from("work_orders").select("organization_id").eq("id", workOrderId).maybeSingle();
      if (error) throw error;
      if (!workOrder) throw new Error("This production QR code is invalid.");
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { count } = await admin.from("production_devices").select("id", { count: "exact", head: true })
        .eq("organization_id", workOrder.organization_id).eq("network_hash", networkHash).gte("created_at", since);
      if ((count ?? 0) >= 10) throw new Error("Too many device requests were made from this network today. Ask a super admin for help.");
      const credential = randomToken();
      const credentialHash = await hmac(secret, `device:${credential}`);
      const { data: device, error: insertError } = await admin.from("production_devices").insert({
        organization_id: workOrder.organization_id,
        device_name: deviceName(body.deviceName),
        credential_hash: credentialHash,
        network_hash: networkHash,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
      }).select("id").single();
      if (insertError) throw insertError;
      return response({ state: "pending", deviceId: device.id, credential });
    }

    if (action === "admin_list") {
      const profile = await requireSuperAdmin(req, admin);
      const [devices, operators, codes] = await Promise.all([
        admin.from("production_devices").select("id, device_name, assigned_operator_id, approved_at, created_at, expires_at, last_seen_at, pending_network_hash, revoked_at").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }),
        admin.from("profiles").select("id, display_name, email, activated_at").eq("organization_id", profile.organization_id).eq("role", "manufacturer").order("display_name"),
        admin.from("production_operator_codes").select("profile_id").eq("organization_id", profile.organization_id).is("disabled_at", null),
      ]);
      if (devices.error) throw devices.error;
      if (operators.error) throw operators.error;
      if (codes.error) throw codes.error;
      return response({ devices: devices.data ?? [], operators: operators.data ?? [], pinOperatorIds: (codes.data ?? []).map((row) => row.profile_id) });
    }

    if (["approve", "approve_network", "revoke"].includes(action)) {
      const profile = await requireSuperAdmin(req, admin);
      const { error } = await admin.rpc("manage_production_device", {
        p_admin_id: profile.id,
        p_device_id: requiredString(body, "deviceId"),
        p_action: action,
        p_operator_id: typeof body.operatorId === "string" ? body.operatorId : null,
      });
      if (error) throw error;
      return response({ ok: true });
    }

    if (action === "reset_pin") {
      const profile = await requireSuperAdmin(req, admin);
      const { error } = await admin.rpc("reset_production_operator_code", { p_admin_id: profile.id, p_operator_id: requiredString(body, "operatorId") });
      if (error) throw error;
      return response({ ok: true });
    }

    if (action === "status") {
      let device: DeviceRow;
      try {
        device = await authorizedDevice(admin, body, secret, networkHash);
      } catch (reason) {
        const message = messageFor(reason);
        if (message.includes("waiting for super admin")) return response({ state: "pending", deviceId: body.deviceId });
        if (message.includes("different network")) return response({ state: "network_pending", deviceId: body.deviceId });
        throw reason;
      }
      const { data: operator } = await admin.from("profiles").select("display_name").eq("id", device.assigned_operator_id).single();
      const { data: code } = await admin.from("production_operator_codes").select("profile_id").eq("profile_id", device.assigned_operator_id).is("disabled_at", null).maybeSingle();
      if (!code) return response({ state: "needs_pin", deviceId: device.id, operatorName: operator?.display_name ?? "Operator" });
      if (typeof body.session === "string" && body.session) {
        try {
          await activeSession(admin, body, secret, networkHash);
          return response({ state: "ready", deviceId: device.id, operatorName: operator?.display_name ?? "Operator" });
        } catch { /* A stale local session simply requires the PIN again. */ }
      }
      return response({ state: "locked", deviceId: device.id, operatorName: operator?.display_name ?? "Operator" });
    }

    if (action === "set_pin") {
      const device = await authorizedDevice(admin, body, secret, networkHash);
      const pin = requiredString(body, "pin");
      if (!/^\d{6}$/.test(pin)) throw new Error("Create a six-digit PIN.");
      const salt = randomToken(18);
      const codeHash = await pinHash(pin, salt, secret);
      const { error } = await admin.rpc("set_production_operator_code", {
        p_operator_id: device.assigned_operator_id,
        p_device_id: device.id,
        p_code_salt: salt,
        p_code_hash: codeHash,
      });
      if (error) throw error;
      return response({ ok: true });
    }

    if (action === "unlock") {
      const device = await authorizedDevice(admin, body, secret, networkHash);
      if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) throw new Error("Too many incorrect PIN attempts. Try again in 15 minutes.");
      const pin = requiredString(body, "pin");
      const { data: code, error } = await admin.from("production_operator_codes").select("code_salt, code_hash").eq("profile_id", device.assigned_operator_id).is("disabled_at", null).maybeSingle();
      if (error) throw error;
      if (!code) throw new Error("This operator has not created a production PIN yet.");
      const attempted = await pinHash(pin, code.code_salt, secret);
      if (!safeEqual(attempted, code.code_hash)) {
        const attempts = device.failed_attempts + 1;
        await admin.from("production_devices").update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null }).eq("id", device.id);
        throw new Error(attempts >= 5 ? "Too many incorrect PIN attempts. Try again in 15 minutes." : "Incorrect PIN.");
      }
      await admin.from("production_devices").update({ failed_attempts: 0, locked_until: null }).eq("id", device.id);
      const session = randomToken();
      const sessionHash = await hmac(secret, `session:${session}`);
      const { error: sessionError } = await admin.from("production_device_sessions").insert({
        organization_id: device.organization_id,
        device_id: device.id,
        operator_id: device.assigned_operator_id,
        session_hash: sessionHash,
        expires_at: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
      });
      if (sessionError) throw sessionError;
      return response({ state: "ready", session });
    }

    if (action === "snapshot") {
      const access = await activeSession(admin, body, secret, networkHash);
      const { data, error } = await admin.rpc("station_production_step_snapshot", {
        p_organization_id: access.device.organization_id,
        p_operator_id: access.operatorId,
        p_device_id: access.device.id,
        p_work_order_id: requiredString(body, "workOrderId"),
        p_routing_step_id: requiredString(body, "routingStepId"),
      }).single();
      if (error) throw error;
      return response({ snapshot: data });
    }

    if (action === "record") {
      const access = await activeSession(admin, body, secret, networkHash);
      const quantity = body.quantity;
      if (typeof quantity !== "number" || !Number.isInteger(quantity)) throw new Error("Quantity must be a whole number.");
      const { data, error } = await admin.rpc("record_station_production_event", {
        p_organization_id: access.device.organization_id,
        p_operator_id: access.operatorId,
        p_device_id: access.device.id,
        p_work_order_id: requiredString(body, "workOrderId"),
        p_routing_step_id: requiredString(body, "routingStepId"),
        p_event_type: requiredString(body, "eventType"),
        p_quantity: quantity,
        p_to_routing_step_id: typeof body.toRoutingStepId === "string" ? body.toRoutingStepId : null,
        p_request_id: requiredString(body, "requestId"),
      }).single();
      if (error) throw error;
      return response({ event: data });
    }

    if (action === "reverse") {
      const access = await activeSession(admin, body, secret, networkHash);
      const { error } = await admin.rpc("reverse_station_production_event", {
        p_organization_id: access.device.organization_id,
        p_operator_id: access.operatorId,
        p_device_id: access.device.id,
        p_event_id: requiredString(body, "eventId"),
      });
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Unsupported production-access action." }, 400);
  } catch (reason) {
    return response({ error: messageFor(reason) }, 400);
  }
});
