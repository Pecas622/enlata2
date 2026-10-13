// Lecturas comunes. Todo pasa por RLS: cada usuario solo ve su espacio de trabajo.
import { createClient } from "@/lib/supabase/server";
import type { Channel, Format, Goal } from "@/lib/channels";
import type { BrandCtx } from "@/lib/generator";
import type { Status } from "@/lib/workflow";

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
