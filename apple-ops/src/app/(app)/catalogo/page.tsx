import Link from "next/link";
import { headers } from "next/headers";
import { DeviceArt } from "@/components/DeviceArt";
import { PageHeader } from "@/components/ui";
import { deviceShort } from "@/lib/catalog";
import { dayStartISO, fmtDateTime, localDay } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { addDays } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { CatalogForm, type CatalogSettings } from "./CatalogForm";
import { DeviceToggles } from "./DeviceToggles";

type Device = { id: string; kind: string; model: string; capacity: number; color: string; condition: string; price_usd: number; catalog_items: { visible: boolean; featured: boolean } | null };

export default async function CatalogoAdminPage() {
  await requireSection("catalogo");
  const supabase = await createClient();
  const [{ data: settings }, { data: devs }, { data: clicks }] = await Promise.all([
    supabase.from("catalog_settings").select("slug, headline, tagline, whatsapp, published, show_accessories").maybeSingle(),
    supabase.from("devices").select("id, kind, model, capacity, color, condition, price_usd, catalog_items(visible, featured)").eq("status", "Disponible").order("entry_date", { ascending: false }),
    supabase.from("assistant_chats").select("id, created_at, topic, item_id").eq("kind", "click").order("created_at", { ascending: false }).limit(500),
  ]);
  const s = (settings ?? { slug: "", headline: "", tagline: "", whatsapp: "", published: false, show_accessories: true }) as CatalogSettings;
  const devices = (devs ?? []) as unknown as Device[];
  const visible = devices.filter((d) => d.catalog_items?.visible ?? true).length;
  const week = dayStartISO(addDays(localDay(), -6));
  const weekClicks = (clicks ?? []).filter((c) => c.created_at >= week).length;
  const clicksBy = new Map<string, number>();
  for (const c of clicks ?? []) if (c.item_id) clicksBy.set(c.item_id, (clicksBy.get(c.item_id) ?? 0) + 1);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/catalogo/${s.slug}`;

  return (
    <>
      <PageHeader
        title="Catálogo online"
        subtitle="Un link para la bio de Instagram: tus equipos disponibles, siempre actualizados desde el stock"
        action={s.slug && <div className="row"><Link href={`/catalogo/${s.slug}`} target="_blank" className="btn btn-secondary" data-testid="cat-preview">Ver catálogo</Link><Link href={`/catalogo/${s.slug}/cotizar`} target="_blank" className="btn btn-secondary">Ver cotizador</Link></div>}
      />
      <div className="stats">
        <div className={`stat ${s.published ? "good" : "warn"}`}><span>Estado</span><b data-testid="cat-state">{s.published ? "Publicado" : "Pausado"}</b></div>
        <div className="stat"><span>Equipos visibles</span><b data-testid="cat-visible">{visible} de {devices.length}</b></div>
        <div className="stat"><span>Consultas (7 días)</span><b data-testid="cat-clicks">{weekClicks}</b><small>Toques en WhatsApp</small></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Tu link</div>
        <div style={{ fontSize: 15, color: "var(--accent)", wordBreak: "break-all" }} data-testid="cat-url">{url}</div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Pegalo en la bio de Instagram: cada visita ve el stock real. El cotizador está en {url}/cotizar.{!s.published && " Mientras esté pausado, el link muestra un aviso."}
        </p>
      </div>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <CatalogForm s={s} />
        <div className="card">
          <h2 className="card-title">Últimas consultas</h2>
          {!clicks?.length ? <div className="empty">Todavía no hubo consultas.</div> : (
            <div className="table-wrap">
              <table className="table" data-testid="cat-clicks-table">
                <thead><tr><th>Cuándo</th><th>Sobre</th></tr></thead>
                <tbody>{clicks.slice(0, 8).map((c) => <tr key={c.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.created_at)}</td><td>{c.topic}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <h2 className="card-title">Equipos del catálogo</h2>
        {devices.length === 0 ? <div className="empty">No hay equipos disponibles en stock.</div> : (
          <div className="table-wrap">
            <table className="table" data-testid="cat-devices">
              <thead><tr><th /><th>Equipo</th><th className="r">Precio</th><th className="r">Consultas</th><th>Destacado</th><th>Visible</th></tr></thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} data-testid="cat-device-row">
                    <td><div style={{ width: 40, height: 40, background: "var(--bg)", borderRadius: 8, padding: 4 }}><DeviceArt kind={d.kind} color={d.color} /></div></td>
                    <td><b>{deviceShort(d)}</b><div className="muted" style={{ fontSize: 11.5 }}>{d.color} · {d.condition}</div></td>
                    <td className="r">{fmtUSD(Number(d.price_usd))}</td>
                    <td className="r">{clicksBy.get(d.id) ?? 0}</td>
                    <DeviceToggles id={d.id} visible={d.catalog_items?.visible ?? true} featured={d.catalog_items?.featured ?? false} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Por ahora el catálogo muestra una ilustración del color de cada equipo. La carga de fotos reales llega con el despliegue.</p>
      </div>
    </>
  );
}
