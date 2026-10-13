import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { formatLabel } from "@/lib/channels";
import { listBrands, listResearch, type ResearchRow } from "@/lib/data";
import { localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { generatorHref } from "@/lib/links";
import { ruleIdeas } from "@/lib/research";
import { IdeaList } from "./IdeaList";
import { ResearchForm } from "./ResearchForm";

// Investigar con IA hace varias búsquedas: la acción puede tardar más que el resto.
export const maxDuration = 180;

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Mendoza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Sources({ urls, all }: { urls: string[]; all: ResearchRow["sources"] }) {
  if (!urls.length) return null;
  return (
    <span className="sources">
      {urls.map((u) => {
        const host = (() => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } })();
        return <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={all.find((s) => s.url === u)?.title || u}>{host}</a>;
      })}
    </span>
  );
}

export default async function InvestigarPage({ searchParams }: { searchParams: Promise<{ marca?: string; id?: string }> }) {
  await requireSection("investigar");
  const sp = await searchParams;
  const brands = await listBrands();
  if (!brands.length) redirect("/marca");
  const brand = brands.find((b) => b.id === sp.marca) ?? brands[0];
  const history = await listResearch(brand.id);
  const current = history.find((r) => r.id === sp.id) ?? history[0];
  const today = localDay();
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader title="Investigar" subtitle="Antes de escribir, mirá qué publica la competencia y de qué se habla en tu rubro. La IA busca en internet y te propone ideas, cada una con sus fuentes." />
      <div className="pills">
        {brands.map((b) => (
          <Link key={b.id} className={`pill${b.id === brand.id ? " active" : ""}`} href={`/investigar?marca=${b.id}`} data-testid="inv-brand">
            <span className="dot" style={{ background: b.color, width: 8, height: 8, marginRight: 6 }} />{b.name}
          </Link>
        ))}
      </div>

      <ResearchForm key={brand.id} brandId={brand.id} brandName={brand.name} city={brand.city} aiEnabled={aiEnabled} />

      {current ? (
        <div className="grid-2" style={{ marginTop: 16 }} data-testid="inv-result">
          <div className="stack">
            <div className="card stack">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <h2 className="card-title" style={{ margin: 0 }}>Lo que encontró</h2>
                <Badge tone="blue">Investigado con IA · {when(current.created_at)}</Badge>
              </div>
              {current.focus && <p className="hint" style={{ margin: 0 }}>Pedido: {current.focus}</p>}
              {current.summary && <p style={{ margin: 0 }} data-testid="inv-summary">{current.summary}</p>}
              {current.trends.length > 0 && (
                <div className="insights">
                  <h3>De qué se habla en el rubro</h3>
                  {current.trends.map((t, i) => (
                    <div key={i} className="insight good" data-testid="inv-trend"><b>{t.title}</b><span>{t.detail}</span><Sources urls={t.sources} all={current.sources} /></div>
                  ))}
                </div>
              )}
              {current.competitors.length > 0 && (
                <div className="insights">
                  <h3>Qué publica la competencia</h3>
                  {current.competitors.map((c, i) => (
                    <div key={i} className="insight neutral" data-testid="inv-competitor"><b>{c.name}</b><span>{c.detail}</span><Sources urls={c.sources} all={current.sources} /></div>
                  ))}
                </div>
              )}
              <p className="hint" style={{ margin: 0 }}>La IA solo cuenta lo que encontró en esas páginas. Abrilas antes de tomar una decisión importante.</p>
            </div>
            {history.length > 1 && (
              <div className="card">
                <h2 className="card-title">Investigaciones anteriores</h2>
                <div className="history" data-testid="inv-history">
                  {history.map((r) => (
                    <Link key={r.id} href={`/investigar?marca=${brand.id}&id=${r.id}`} style={{ fontWeight: r.id === current.id ? 600 : 400 }}>
                      {when(r.created_at)} · {r.author?.name ?? "Alguien"}{r.focus ? ` · ${r.focus}` : ""}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          <IdeaList key={current.id} researchId={current.id} brandId={brand.id} ideas={current.ideas} sources={current.sources} today={today} />
        </div>
      ) : (
        <div className="card stack" style={{ marginTop: 16 }} data-testid="inv-rules">
          <h2 className="card-title" style={{ margin: 0 }}>Ideas para arrancar</h2>
          <p className="hint" style={{ margin: 0 }}>Estas no salen de buscar en internet: son las fechas que vienen y ángulos que suelen funcionar con lo que vende {brand.name}.</p>
          {ruleIdeas(brand, today).map((i) => (
            <div key={i.topic} className="idea-row" data-testid="inv-rule-idea">
              <div><b>{i.topic}</b><div className="sub">{i.why}</div><div className="sub">{i.channel} · {formatLabel(i.format, i.channel)} · {i.goal}</div></div>
              <Link className="btn btn-secondary" href={generatorHref(brand.id, i)}>Escribir</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
