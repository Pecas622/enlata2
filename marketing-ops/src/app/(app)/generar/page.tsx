import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { listBrands } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { requireSection } from "@/lib/guard";
import { GenerateForm, type IdeaInit } from "./GenerateForm";

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ marca?: string; idea?: string }> }) {
  const { perms } = await requireSection("generar");
  const { marca, idea: ideaId } = await searchParams;
  const brands = await listBrands();
  let idea: IdeaInit | undefined;
  if (ideaId) {
    const supabase = await createClient();
    const { data } = await supabase.from("contents").select("id, title, topic, brand_id, channel, format, goal, status").eq("id", ideaId).maybeSingle();
    if (data && data.status === "Idea") {
      idea = { id: data.id, title: data.title || data.topic, brandId: data.brand_id, channel: data.channel, format: data.format, goal: data.goal, topic: data.topic };
    }
  }
  return (
    <>
      <PageHeader title="Generar contenido" subtitle="Elegí la marca, la red y qué querés lograr. Te damos 3 versiones para elegir y editar." />
      {brands.length === 0 ? (
        <div className="card empty">
          Primero cargá una marca para que el generador sepa cómo habla tu negocio.
          {perms.editBrand && <div style={{ marginTop: 12 }}><Link className="btn btn-primary" href="/marca/nueva">Cargar marca</Link></div>}
        </div>
      ) : (
        <GenerateForm brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.color }))} initialBrand={marca} idea={idea} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
      )}
    </>
  );
}
