import Link from "next/link";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { PUB_TONE } from "@/lib/publish";
import { hasTokensKey } from "@/lib/crypto";
import { listBrands } from "@/lib/data";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { accountTypeLabel } from "@/lib/instagram";
import { createClient } from "@/lib/supabase/server";
import { AccountActions } from "./AccountActions";

type Account = {
  id: string; brand_id: string; platform: string; username: string; name: string; picture_url: string; account_type: string;
  followers: number | null; status: string; last_error: string; token_expires_at: string | null; connected_at: string; checked_at: string | null;
};
type Pub = { id: string; content_id: string; status: string; scheduled_at: string; published_at: string | null; last_error: string; permalink: string; contents: { title: string; topic: string } | null; brands: { name: string } | null };
type Event = { id: string; action: string; at: string; profiles: { name: string } | null; brands: { name: string } | null };

const SOON: { platform: string; why: string }[] = [
  { platform: "Facebook", why: "Páginas de Facebook, con el inicio de sesión de Meta." },
  { platform: "TikTok", why: "Necesita la app de TikTok para desarrolladores aprobada." },
];

export default async function RedesPage({ searchParams }: { searchParams: Promise<{ conectada?: string; error?: string }> }) {
  const { perms } = await requireSection("redes");
  const { conectada, error } = await searchParams;
  const supabase = await createClient();
  const [brands, { data: accounts }, { data: events }, { data: pubs }] = await Promise.all([
    listBrands(),
    supabase.from("social_accounts").select("id, brand_id, platform, username, name, picture_url, account_type, followers, status, last_error, token_expires_at, connected_at, checked_at"),
    supabase.from("social_events").select("id, action, at, profiles(name), brands(name)").order("at", { ascending: false }).limit(10),
    supabase.from("publications").select("id, content_id, status, scheduled_at, published_at, last_error, permalink, contents(title, topic), brands(name)")
      .order("scheduled_at", { ascending: false }).limit(40),
  ]);
  const all = (pubs ?? []) as unknown as Pub[];
  const pending = all.filter((p) => p.status !== "Publicada").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const recent = all.filter((p) => p.status === "Publicada").slice(0, 5);
  const ready = Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) && hasTokensKey();
  const byBrand = (id: string) => ((accounts ?? []) as Account[]).filter((a) => a.brand_id === id);

  return (
    <>
      <PageHeader title="Redes" subtitle="Conectá las cuentas de cada marca con el inicio de sesión oficial de cada red. La app nunca ve tu contraseña: la red le da un permiso que podés sacar cuando quieras." />
      {conectada && <div style={{ marginBottom: 12 }}><Notice tone="blue">Listo: {conectada} quedó conectada.</Notice></div>}
      {error && <div style={{ marginBottom: 12 }} data-testid="redes-error"><Notice tone="red">{error}</Notice></div>}
      {!ready && (
        <div style={{ marginBottom: 12 }} data-testid="redes-sin-config">
          <Notice tone="amber">
            Para conectar Instagram falta configurar la app de Meta en el servidor (INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET y TOKENS_KEY). Mientras tanto no se puede conectar: no simulamos conexiones.
          </Notice>
        </div>
      )}
      {!brands.length && <div className="card empty">Primero cargá una marca.</div>}
      <div className="stack">
        {brands.map((b) => {
          const list = byBrand(b.id);
          const ig = list.find((a) => a.platform === "Instagram");
          return (
            <section key={b.id} className="card" data-testid="redes-brand">
              <h2 className="card-title"><span className="dot" style={{ background: b.color }} />{b.name}</h2>
              <div className="social-row" data-testid="social-instagram">
                <div className="social-name"><b>Instagram</b><span className="sub">Cuenta profesional (Empresa o Creador)</span></div>
                {ig ? (
                  <div className="social-info">
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <Badge tone={ig.status === "Conectada" ? "green" : "red"}>{ig.status}</Badge>
                      <b>@{ig.username}</b>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {[accountTypeLabel(ig.account_type), ig.followers !== null ? `${ig.followers.toLocaleString("es-AR")} seguidores` : "", ig.token_expires_at ? `permiso hasta el ${fmtDate(ig.token_expires_at)}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    {ig.status !== "Conectada" && ig.last_error && <span className="sub">{ig.last_error}</span>}
                    <span className="sub">Conectada el {fmtDateTime(ig.connected_at)}{ig.checked_at ? ` · probada el ${fmtDateTime(ig.checked_at)}` : ""}</span>
                    <AccountActions id={ig.id} canDisconnect={perms.editBrand} />
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>Sin conectar</span>
                )}
                {perms.editBrand && (
                  ready
                    ? <a className={`btn ${ig ? "btn-secondary" : "btn-primary"} btn-sm`} href={`/api/redes/instagram/inicio?marca=${b.id}`} data-testid="social-connect">{ig ? "Reconectar" : "Conectar Instagram"}</a>
                    : <button className="btn btn-primary btn-sm" disabled data-testid="social-connect">Conectar Instagram</button>
                )}
              </div>
              {SOON.map((s) => (
                <div key={s.platform} className="social-row muted-row">
                  <div className="social-name"><b>{s.platform}</b><span className="sub">{s.why}</span></div>
                  <span />
                  <Badge tone="gray">Próximamente</Badge>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {!perms.editBrand && <p className="hint">Solo el Administrador conecta y desconecta cuentas. Vos podés probar que sigan andando.</p>}
      <div className="card" style={{ marginTop: 16 }} data-testid="redes-publicaciones">
        <h2 className="card-title">Publicaciones</h2>
        {!all.length ? (
          <div className="empty" style={{ padding: 16 }}>Todavía no hay nada programado. Desde una pieza aprobada de Instagram la publicás o la programás.</div>
        ) : (
          <div className="timeline">
            {[...pending, ...recent].map((p) => (
              <div key={p.id}>
                <b>
                  <Link href={`/contenidos/${p.content_id}`}>{p.contents?.title || p.contents?.topic || "Pieza"}</Link>{p.brands ? ` · ${p.brands.name}` : ""}{" "}
                  <Badge tone={PUB_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                </b>
                {p.status === "Error" && <q>{p.last_error}</q>}
                <span>
                  {p.status === "Publicada" ? `Salió el ${fmtDateTime(p.published_at)}` : `${p.status === "Error" ? "Iba a salir" : "Sale"} el ${fmtDateTime(p.scheduled_at)}`}
                  {p.permalink && <> · <a href={p.permalink} target="_blank" rel="noreferrer">Verla en Instagram</a></>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Historial</h2>
        {!events?.length ? <div className="empty" style={{ padding: 16 }}>Todavía no se conectó ninguna cuenta.</div> : (
          <div className="timeline" data-testid="redes-history">
            {(events as unknown as Event[]).map((e) => <div key={e.id}><b>{e.action}{e.brands ? ` · ${e.brands.name}` : ""}{e.profiles ? ` · ${e.profiles.name}` : ""}</b><span>{fmtDateTime(e.at)}</span></div>)}
          </div>
        )}
      </div>
    </>
  );
}
