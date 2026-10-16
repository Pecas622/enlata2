// Plan del espacio y su uso del mes. Los topes los aplica la base (triggers y use_ai); acá solo se leen y se piden.
import { createClient } from "@/lib/supabase/server";

export type AiKind = "generar" | "adaptar" | "editar" | "plan" | "investigar" | "analizar";

export type PlanUsage = {
  plan: string; plan_name: string;
  max_brands: number; brands: number;
  max_members: number; members: number;
  ai_per_month: number; ai_used: number;
  max_storage_mb: number; storage_bytes: number;
};

export async function planUsage(): Promise<PlanUsage | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("plan_usage");
  return ((data as PlanUsage[] | null) ?? [])[0] ?? null;
}

export const AI_LIMIT_NOTICE = "Se terminaron las acciones con IA de tu plan este mes, así que esto sale de las reglas y plantillas, con los mismos datos de la marca.";

// "ok": se puede llamar a Claude y ya quedó contado. "sin-clave": no hay ANTHROPIC_API_KEY. "sin-cupo": el plan llegó a su tope.
export async function takeAi(kind: AiKind): Promise<"ok" | "sin-clave" | "sin-cupo"> {
  if (!process.env.ANTHROPIC_API_KEY) return "sin-clave";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_ai", { p_kind: kind });
  if (error) {
    // Si la base no responde, no se frena el trabajo: se usa la IA igual y queda en el log.
    console.error("No se pudo contar la acción con IA:", error.message);
    return "ok";
  }
  return data ? "ok" : "sin-cupo";
}
