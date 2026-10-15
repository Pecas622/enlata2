import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador, con la sesión del usuario. Solo para subir archivos directo a Storage (los videos no pasan
// por el servidor de Vercel, que corta los pedidos grandes); los permisos los aplican las políticas del bucket.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
