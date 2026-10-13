// Lecturas comunes. Todo pasa por RLS: cada usuario solo ve su espacio de trabajo.
import { createClient } from "@/lib/supabase/server";
import type { Channel, Format, Goal } from "@/lib/channels";
import type { BrandCtx } from "@/lib/generator";
import type { Status } from "@/lib/workflow";
import { localDay } from "@/lib/dates";
import type { PieceResult, Results } from "@/lib/metrics";

export type BrandRow = BrandCtx & { id: string; color: string; updated_at: string };

export type ContentRow = {
  id: string;
  brand_id: string;
  channel: Channel;
  format: Format;
  goal: Goal;
  topic: string;
  title: string;
  body: string;
  hashtags: string;
  cta: string;
  status: Status;
  publish_on: string | null;
  campaign_id: string | null;
  source: "ia" | "plantilla" | "manual";
  created_at: string;
  updated_at: string;
  brands: { name: string; color: string } | null;
  author: { name: string } | null;
};

export const BRAND_COLS = "id, name, industry, city, description, audience, value_prop, products, tone, words_avoid, cta, hashtags, website, instagram, whatsapp, color, updated_at";
export const CONTENT_COLS = "id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, campaign_id, source, created_at, updated_at, brands(name, color), author:profiles!contents_created_by_fkey(name)";

export async function listBrands(): Promise<BrandRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select(BRAND_COLS).order("name");
  return (data ?? []) as BrandRow[];
}

export async function getBrand(id: string): Promise<BrandRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select(BRAND_COLS).eq("id", id).maybeSingle();
  return (data as BrandRow | null) ?? null;
}

export async function listContents(): Promise<ContentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("contents").select(CONTENT_COLS).order("updated_at", { ascending: false });
  return (data ?? []) as unknown as ContentRow[];
}

export type CampaignRow = {
  id: string;
  brand_id: string;
  name: string;
  goal: Goal;
  starts_on: string;
  ends_on: string;
  budget: number;
  offer: string;
  audience: string;
  locations: string;
  age_min: number;
  age_max: number;
  interests: string;
  notes: string;
  updated_at: string;
  brands: { name: string; color: string } | null;
};

export const CAMPAIGN_COLS = "id, brand_id, name, goal, starts_on, ends_on, budget, offer, audience, locations, age_min, age_max, interests, notes, updated_at, brands(name, color)";

// numeric llega como texto desde PostgREST.
const asCampaign = (r: Record<string, unknown>) => ({ ...r, budget: Number(r.budget) }) as unknown as CampaignRow;

export async function listCampaigns(): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select(CAMPAIGN_COLS).order("starts_on", { ascending: false });
  return (data ?? []).map(asCampaign);
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select(CAMPAIGN_COLS).eq("id", id).maybeSingle();
  return data ? asCampaign(data) : null;
}

export type ResultRow = Results & { content_id: string; notes: string; updated_at: string };

export async function listResults(): Promise<Map<string, ResultRow>> {
  const supabase = await createClient();
  const { data } = await supabase.from("content_results").select("content_id, reach, interactions, clicks, inquiries, sales, spend, notes, updated_at");
  return new Map((data ?? []).map((r) => [r.content_id as string, { ...r, spend: Number(r.spend) } as ResultRow]));
}

// Las piezas publicadas con sus resultados (o null si faltan cargar), listas para las métricas.
export function publishedPieces(contents: ContentRow[], results: Map<string, ResultRow>): (PieceResult & { brand_id: string })[] {
  return contents
    .filter((c) => c.status === "Publicado")
    .map((c) => {
      const r = results.get(c.id);
      return {
        id: c.id, title: c.title || c.topic || "Sin título", brand: c.brands?.name ?? "", channel: c.channel, format: c.format, goal: c.goal,
        day: c.publish_on ?? localDay(c.updated_at), campaign_id: c.campaign_id,
        results: r ? { reach: r.reach, interactions: r.interactions, clicks: r.clicks, inquiries: r.inquiries, sales: r.sales, spend: r.spend } : null,
        brand_id: c.brand_id,
      };
    });
}
