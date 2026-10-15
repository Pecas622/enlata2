import { createClient as create } from "@supabase/supabase-js";

// Cliente con la clave de servicio: solo en el servidor y solo para el publicador, que corre sin una persona con
// sesión (el cron) y usa funciones que no se le dan a authenticated. Nunca lo importes desde un componente de cliente.
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return create(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
