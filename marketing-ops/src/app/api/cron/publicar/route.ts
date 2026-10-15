import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { publisherReady, runPublications } from "@/lib/publisher";

// Lo llama un cron cada pocos minutos (Supabase pg_cron, Vercel Cron o cualquier otro) con
// "Authorization: Bearer <CRON_SECRET>". Publica lo programado que ya toca.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!publisherReady()) return NextResponse.json({ error: "Faltan SUPABASE_SERVICE_ROLE_KEY o TOKENS_KEY en el servidor." }, { status: 503 });
  try {
    const r = await runPublications({ limit: 5 });
    return NextResponse.json({ ran: r.ran, published: r.published, retry: r.retry, errors: r.errors });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
