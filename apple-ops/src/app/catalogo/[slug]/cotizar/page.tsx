import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicConfig, loadPublicValues } from "@/lib/public-catalog";
import { createClient } from "@/lib/supabase/server";
import { QuoteForm } from "./QuoteForm";

export const metadata: Metadata = { title: "Cotizá tu iPhone" };

export default async function CotizarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const cfg = await loadPublicConfig(supabase, slug);
  if (!cfg || !cfg.quote_on) notFound();
  const values = await loadPublicValues(supabase, slug);
  return (
    <div className="pc" data-testid="quote-page">
      <header className="pc-head">
        <div className="pc-wrap pc-head-in">
          <Link href={`/catalogo/${slug}`} className="pc-store">{cfg.store_name}</Link>
          <Link href={`/catalogo/${slug}`} className="pc-link">Ver equipos</Link>
        </div>
      </header>
      <QuoteForm cfg={cfg} values={values} />
      <footer className="pc-foot">
        <div className="pc-wrap">
          <div className="pc-foot-name">{cfg.store_name}</div>
          <div>{cfg.address}</div>
        </div>
      </footer>
    </div>
  );
}
