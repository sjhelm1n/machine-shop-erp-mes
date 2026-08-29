import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type AppRole = "manufacturer" | "customer";

type RequestBody =
  | { action: "list" }
  | { action: "activate" }
  | { action: "remove"; userId: string }
  | {
      action: "invite";
      email: string;
      displayName: string;
      position: string | null;
      role: AppRole;
      customerId: string | null;
      redirectTo: string;
    };

type InvitationRecord = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  customerId: string | null;
};

type RpcError = { message: string };
type UserManagementRpcClient = {
  rpc<T>(functionName: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: RpcError | null }>;
};

function invitationRedirect(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The invitation redirect URL is invalid.");
  }

  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/auth/confirm") {
    throw new Error("The invitation redirect URL is not an allowed ShopCore confirmation route.");
  }

  const configuredOrigins = new Set(
    (Deno.env.get("SHOPCORE_ALLOWED_INVITE_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  if (!localHttp && !configuredOrigins.has(url.origin)) {
    throw new Error("The invitation redirect origin is not configured for ShopCore.");
  }

  url.search = "?next=/update-password";
  url.hash = "";
  return url.toString();
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unable to manage user access.";
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const rpcClient = ctx.supabase as unknown as UserManagementRpcClient;
    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      return Response.json({ error: "A JSON request body is required." }, { status: 400 });
    }

    try {
      if (body.action === "list") {
        const [profiles, customers] = await Promise.all([
          ctx.supabase
            .from("profiles")
            .select("id, organization_id, customer_id, email, display_name, position, role, is_super_admin, invited_at, activated_at")
            .order("display_name")
            .order("id"),
          ctx.supabase
            .from("customers")
            .select("id, customer_name, portal_email_domain")
            .order("customer_name")
            .order("id"),
        ]);

        if (profiles.error) throw profiles.error;
        if (customers.error) throw customers.error;
        return Response.json({ users: profiles.data ?? [], customers: customers.data ?? [] });
      }

      if (body.action === "activate") {
        const { error } = await rpcClient.rpc<null>("activate_my_profile");
        if (error) throw error;
        return Response.json({ ok: true });
      }

      if (body.action === "remove") {
        const removal = await rpcClient.rpc<string>("remove_user_access", { p_user_id: body.userId });
        if (removal.error) throw removal.error;

        const authRemoval = await ctx.supabaseAdmin.auth.admin.deleteUser(body.userId);
        if (authRemoval.error) {
          // The audited profile deletion already removed all ERP/portal authorization.
          return Response.json({ ok: true, authCleanupPending: true });
        }

        return Response.json({ ok: true, authCleanupPending: false });
      }

      if (body.action === "invite") {
        const prepared = await rpcClient.rpc<InvitationRecord>("create_user_invitation", {
          p_email: body.email,
          p_display_name: body.displayName,
          p_role: body.role,
          p_customer_id: body.customerId,
          p_position: body.position,
        });
        if (prepared.error) throw prepared.error;

        if (!prepared.data) throw new Error("The invitation could not be prepared.");
        const invitation = prepared.data;
        const invited = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(invitation.email, {
          data: { display_name: invitation.displayName },
          redirectTo: invitationRedirect(body.redirectTo),
        });

        if (invited.error || !invited.data.user) {
          await rpcClient.rpc<null>("cancel_user_invitation", { p_invitation_id: invitation.id });
          throw invited.error ?? new Error("Supabase Auth did not return the invited user.");
        }

        const completed = await rpcClient.rpc<null>("complete_user_invitation", {
          p_invitation_id: invitation.id,
          p_user_id: invited.data.user.id,
        });

        if (completed.error) {
          await ctx.supabaseAdmin.auth.admin.deleteUser(invited.data.user.id);
          await rpcClient.rpc<null>("cancel_user_invitation", { p_invitation_id: invitation.id });
          throw completed.error;
        }

        return Response.json({ ok: true, userId: invited.data.user.id });
      }

      return Response.json({ error: "Unsupported user-management action." }, { status: 400 });
    } catch (reason) {
      return Response.json({ error: messageFor(reason) }, { status: 400 });
    }
  }),
};
