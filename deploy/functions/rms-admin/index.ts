import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey);

function generatedPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*-_";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

async function isPlatformAdmin(userId: string) {
  const { data, error } = await admin.from("user_roles").select("id")
    .eq("user_id", userId).eq("role", "super_admin").limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function requirePlatformAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Response("No autenticado", { status: 401 });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Response("No autenticado", { status: 401 });
  if (!(await isPlatformAdmin(data.user.id))) throw new Response("Solo el administrador de Rekov puede gestionar negocios", { status: 403 });
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "bootstrap") {
      const email = Deno.env.get("RMS_PLATFORM_ADMIN_EMAIL")?.trim().toLowerCase();
      const password = Deno.env.get("RMS_PLATFORM_ADMIN_PASSWORD");
      if (!email || !password || password.length < 12) {
        return json({
          ready: false,
          error: "Faltan RMS_PLATFORM_ADMIN_EMAIL y RMS_PLATFORM_ADMIN_PASSWORD en Infisical (contraseña de 12 caracteres mínimo).",
        }, 503);
      }

      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      let user = listed.users.find((entry) => entry.email?.toLowerCase() === email);
      if (!user) {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Rekov Systems" },
        });
        if (createError || !created.user) throw createError ?? new Error("No se pudo crear el administrador de plataforma");
        user = created.user;
      } else if (!(await isPlatformAdmin(user.id))) {
        const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
          password,
          email_confirm: true,
          user_metadata: { ...user.user_metadata, full_name: "Rekov Systems" },
        });
        if (updateError) throw updateError;
        user = updated.user;
      }

      if (!(await isPlatformAdmin(user.id))) {
        const { error: bootstrapError } = await admin.rpc("rms_bootstrap_platform_admin", { _user_id: user.id });
        if (bootstrapError) throw bootstrapError;
      }
      return json({ ready: true, admin_email: email });
    }

    const caller = await requirePlatformAdmin(req);
    if (action === "list_tenants") {
      const { data: tenants, error } = await admin.from("tenants")
        .select("id,name,slug,domain,status,created_at")
        .or("slug.is.null,slug.neq.rekov-platform")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (tenants ?? []).map((tenant) => tenant.id);
      const { data: owners, error: ownersError } = ids.length
        ? await admin.from("user_roles").select("tenant_id,user_id")
          .in("tenant_id", ids).eq("role", "owner")
        : { data: [], error: null };
      if (ownersError) throw ownersError;
      const ownerIds = [...new Set((owners ?? []).map((row) => row.user_id))];
      const { data: profiles, error: profilesError } = ownerIds.length
        ? await admin.from("profiles").select("id,email,full_name").in("id", ownerIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const ownerByTenant = new Map((owners ?? []).map((row) => [row.tenant_id, profileById.get(row.user_id) ?? null]));
      return json({ tenants: (tenants ?? []).map((tenant) => ({
        ...tenant,
        owner: ownerByTenant.get(tenant.id) ?? null,
      })) });
    }

    if (action === "create_tenant") {
      const name = String(body.name ?? "").trim();
      const slug = String(body.slug ?? "").trim().toLowerCase();
      const branchName = String(body.branch_name ?? "Sucursal principal").trim();
      const ownerEmail = String(body.owner_email ?? "").trim().toLowerCase();
      const ownerName = String(body.owner_name ?? "").trim();
      if (!name || !ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
        return json({ error: "Nombre del negocio y correo válido del dueño son requeridos" }, 400);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 48) {
        return json({ error: "Usa un identificador de 3 a 48 caracteres: letras, números y guiones" }, 400);
      }
      if (["pos", "api", "studio", "admin", "control", "www", "rekov-platform"].includes(slug)) {
        return json({ error: "Ese nombre está reservado por la plataforma" }, 400);
      }

      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existing?.users.some((entry) => entry.email?.toLowerCase() === ownerEmail)) {
        return json({ error: "Ese correo ya tiene una cuenta. Crea el negocio con un correo nuevo o asígnale el tenant desde Usuarios." }, 409);
      }

      const tempPassword = generatedPassword();
      const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: ownerName || ownerEmail },
      });
      if (userError || !createdUser.user) return json({ error: userError?.message ?? "No se pudo crear el usuario dueño" }, 400);

      const domain = `${slug}.pos.rekov.co`;
      const { data: createdTenant, error: tenantError } = await admin.rpc("rms_create_tenant_with_owner", {
        _name: name,
        _slug: slug,
        _domain: domain,
        _branch_name: branchName || "Sucursal principal",
        _owner_id: createdUser.user.id,
      });
      if (tenantError) {
        await admin.auth.admin.deleteUser(createdUser.user.id);
        throw tenantError;
      }
      const row = Array.isArray(createdTenant) ? createdTenant[0] : createdTenant;
      return json({
        tenant: { id: row.tenant_id, name, slug, domain, status: "active" },
        owner: { email: ownerEmail, name: ownerName || ownerEmail },
        temporary_password: tempPassword,
        created_by: caller.id,
      }, 201);
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (error) {
    if (error instanceof Response) return json({ error: await error.text() }, error.status);
    console.error("rms_admin_failed", error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
