import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { splitList } from "@/lib/campaigns";
import { getCampaign, listBrands } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { requireSection } from "@/lib/guard";
import { CHANNELS, FORMATS, GOALS, isValidCombo, type Channel, type Format } from "@/lib/channels";
import { GenerateForm, type CampaignInit, type IdeaInit } from "./GenerateForm";

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ marca?: string; idea?: string; campana?: string; formato?: string; red?: string; objetivo?: string; tema?: string }> }) {
  const { perms } = await requireSection("generar");
  const { marca, idea: ideaId, campana, formato, red, objetivo, tema } = await searchParams;
  const brands = await listBrands();
  let idea: IdeaInit | undefined;
  if (ideaId) {
    const supabase = await createClient();
    const { data } = await supabase.from("contents").select("id, title, topic, brand_id, channel, format, goal, status").eq("id", ideaId).maybeSingle();
    // Una Idea se escribe; una pieza sin publicar ni en revisión se regenera (la variante elegida reemplaza su texto).
    if (data && ["Idea", "Borrador", "Aprobado"].includes(data.status)) {
      idea = { id: data.id, title: data.title || data.topic, brandId: data.brand_id, channel: data.channel, format: data.format, goal: data.goal, topic: data.topic, regen: data.status !== "Idea" };
    }
  }
  let campaign: CampaignInit | undefined;
  if (campana && !idea) {
    const c = await getCampaign(campana);
    // Sin producto cargado en la campaña, arranca con el primero de la marca (se puede cambiar antes de generar).
    const firstProduct = splitList(brands.find((b) => b.id === c?.brand_id)?.products ?? "")[0] ?? "";
    if (c) campaign = { id: c.id, name: c.name, brandId: c.brand_id, goal: c.goal, offer: c.offer, product: c.product.trim() || firstProduct };
  }
  const initialFormat = (FORMATS as readonly string[]).includes(formato ?? "") ? (formato as Format) : undefined;
  // Una idea de la investigación llega con red, objetivo y tema en la URL.
  const initialChannel = (CHANNELS as readonly string[]).includes(red ?? "") ? (red as Channel) : undefined;
  const initialGoal = (GOALS as readonly string[]).includes(objetivo ?? "") ? objetivo : undefined;
  const initialTopic = tema?.slice(0, 300);
  return (
    <>
      <PageHeader title="Generar contenido" subtitle="Elegí la marca, la red y qué querés lograr. Te damos 3 versiones para elegir y editar." />
      {brands.length === 0 ? (
        <div className="card empty">
          Primero cargá una marca para que el generador sepa cómo habla tu negocio.
          {perms.editBrand && <div style={{ marginTop: 12 }}><Link className="btn btn-primary" href="/marca/nueva">Cargar marca</Link></div>}
        </div>
      ) : (
        <GenerateForm brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.color }))} initialBrand={marca} idea={idea} campaign={campaign} initialFormat={initialChannel && initialFormat && !isValidCombo(initialChannel, initialFormat) ? undefined : initialFormat} initialChannel={initialChannel} initialGoal={initialGoal} initialTopic={initialTopic} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
      )}
    </>
  );
}
