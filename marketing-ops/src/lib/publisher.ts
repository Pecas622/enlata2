// El publicador: toma las publicaciones que ya tocan, las publica en Instagram y deja el resultado en la base.
// Lo corre "Publicar ahora" (para una pieza) y el cron (/api/cron/publicar). Usa la clave de servicio.
import { decrypt, encrypt, hasTokensKey } from "./crypto";
import { refresh, shouldRefresh } from "./instagram";
import { MEDIA_BUCKET } from "./media";
import { processJob, type Job, type MediaRef, type Outcome } from "./publish";
import { adminClient } from "./supabase/admin";
import type { Format } from "./channels";

type Claimed = {
  id: string; content_id: string; account_id: string; format: Format; caption: string; container_id: string;
  token_enc: string; token_expires_at: string | null; connected_at: string; ig_user_id: string; media: MediaRef[];
};

export type RunResult = { ran: number; published: number; retry: number; errors: number; outcomes: Record<string, Outcome> };

export const publisherReady = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && hasTokensKey();

export async function runPublications(opts: { only?: string; limit?: number; waitMs?: number } = {}): Promise<RunResult> {
  const res: RunResult = { ran: 0, published: 0, retry: 0, errors: 0, outcomes: {} };
  const db = adminClient();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para publicar.");
  const { data, error } = await db.rpc("claim_publications", { p_limit: opts.limit ?? 5, p_only: opts.only ?? null });
  if (error) throw new Error(error.message);
  for (const j of (data ?? []) as Claimed[]) {
    res.ran++;
    let outcome: Outcome;
    try {
      let token = decrypt(j.token_enc);
      if (shouldRefresh(j.token_expires_at, j.connected_at)) {
        const fresh = await refresh(token).catch(() => null);
        if (fresh) {
          token = fresh.token;
          await db.rpc("save_publication_token", { p_account_id: j.account_id, p_token_enc: encrypt(fresh.token), p_expires_at: fresh.expiresAt });
        }
      }
      const job: Job = { id: j.id, format: j.format, caption: j.caption, container_id: j.container_id, ig_user_id: j.ig_user_id, media: j.media };
      outcome = await processJob(job, {
        token,
        waitMs: opts.waitMs,
        // Instagram baja el archivo de este link; dura una hora, de sobra para que lo procese.
        sign: async (path) => {
          const { data: s, error: e } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
          if (e || !s) throw new Error(`no se pudo armar el link del archivo (${e?.message ?? "sin respuesta"})`);
          return s.signedUrl;
        },
        saveContainer: async (id) => {
          await db.rpc("save_publication_container", { p_id: j.id, p_container_id: id });
        },
      });
    } catch (e) {
      outcome = { error: e instanceof Error && /TOKENS_KEY|formato desconocido|decrypt|auth/i.test(e.message)
        ? "No se pudo leer el permiso guardado de Instagram: reconectá la cuenta en Redes." : e instanceof Error ? e.message : "Error desconocido" };
    }
    await db.rpc("finish_publication", { p_id: j.id, p: outcome });
    res.outcomes[j.content_id] = outcome;
    if ("ok" in outcome) res.published++;
    else if ("retry" in outcome) res.retry++;
    else res.errors++;
  }
  return res;
}
