import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const PASSWORD = "demo1234";
export const STORE = "00000000-0000-4000-8000-000000000001";
export const PROFILE = {
  admin: "00000000-0000-4000-8000-0000000000a1",
  encargado: "00000000-0000-4000-8000-0000000000a2",
  vendedor: "00000000-0000-4000-8000-0000000000a3",
  cajero: "00000000-0000-4000-8000-0000000000a4",
} as const;

export const USERS = {
  admin: "santiago@demo.apple-ops.test",
  encargado: "lucia@demo.apple-ops.test",
  vendedor: "mati@demo.apple-ops.test",
  cajero: "caro@demo.apple-ops.test",
} as const;
export type Who = keyof typeof USERS;

export const fresh = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
export const service = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

export async function as(who: Who): Promise<SupabaseClient> {
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email: USERS[who], password: PASSWORD });
  if (error) throw error;
  return c;
}

export async function signInAll() {
  const out = {} as Record<Who, SupabaseClient>;
  for (const who of Object.keys(USERS) as Who[]) out[who] = await as(who);
  return out;
}

// IMEI de prueba único por corrida.
export function testIMEI() {
  return "99" + String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}
