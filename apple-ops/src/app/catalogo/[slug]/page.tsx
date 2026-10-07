import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { refreshFxForSlug } from "@/lib/fx-server";
import { loadPublicCatalog } from "@/lib/public-catalog";
import { createClient } from "@/lib/supabase/server";
import { PublicCatalogView } from "./PublicCatalogView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = await loadPublicCatalog(await createClient(), slug);
  return cat.state === "ok" ? { title: `${cat.cfg.store_name} · Catálogo`, description: cat.cfg.tagline } : { title: "Catálogo" };
}

export default async function CatalogoPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = await loadPublicCatalog(await createClient(), slug);
  if (cat.state === "missing") notFound();
  after(() => refreshFxForSlug(slug));
  if (cat.state === "paused") {
    return (
      <div className="pc pc-paused" data-testid="catalog-paused">
        <div><div className="pc-paused-title">{cat.storeName}</div><p>Estamos actualizando el catálogo. Volvemos pronto.</p></div>
      </div>
    );
  }
  return <PublicCatalogView cfg={cat.cfg} devices={cat.devices} accessories={cat.accessories} />;
}
