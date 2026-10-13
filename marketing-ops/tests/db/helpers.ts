import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const PASSWORD = "demo1234";
export const WS = "00000000-0000-4000-8000-000000000001";
export const BRAND = { espiga: "00000000-0000-4000-8000-0000000000b1", rodar: "00000000-0000-4000-8000-0000000000b2" } as const;
export const PROFILE = {
  admin: "00000000-0000-4000-8000-0000000000a1",
  creador: "00000000-0000-4000-8000-0000000000a2",
  revisor: "00000000-0000-4000-8000-0000000000a3",
} as const;
export const USERS = {
  admin: "santiago@demo.marketing-ops.test",
  creador: "lucia@demo.marketing-ops.test",
  revisor: "mati@demo.marketing-ops.test",
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

// Pieza nueva de prueba, creada por el Creador. Devuelve su id.
export async function newPiece(body = "Texto de prueba. Pedí por WhatsApp.") {
  const c = await as("creador");
  const { data, error } = await c.rpc("save_content", {
    p_id: null,
    p: { brand_id: BRAND.espiga, channel: "Instagram", format: "Post", goal: "Vender", topic: "prueba " + Date.now(), title: "Prueba", body, source: "plantilla" },
  });
  if (error) throw error;
  return data as string;
}
