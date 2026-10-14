import { headers } from "next/headers";
import { Fragment } from "react";
import { PageHeader } from "@/components/ui";
import { listBrands } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { ROLE_HELP, ROLES, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { brandsLabel, daysLeft, inviteLink } from "@/lib/team";
import { fmtSize } from "@/lib/media";
import { planUsage } from "@/lib/usage";
import { InviteForm } from "./InviteForm";
import { InvitationRow, MemberRow } from "./Rows";

type Member = { id: string; name: string; email: string; role: Role; active: boolean; brand_ids: string[] | null };
type Invitation = { id: string; email: string; name: string; role: Role; brand_ids: string[] | null; token: string; expires_at: string; created_at: string };
type Event = { id: string; action: string; at: string; profiles: { name: string } | null };

export default async function EquipoPage() {
  const { user } = await requireSection("equipo");
  const supabase = await createClient();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: members }, { data: invites }, { data: events }, brands, usage] = await Promise.all([
    supabase.from("profiles").select("id, name, email, role, active, brand_ids").order("active", { ascending: false }).order("name"),
    supabase.from("invitations").select("id, email, name, role, brand_ids, token, expires_at, created_at").eq("status", "Pendiente").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    supabase.from("team_events").select("id, action, at, profiles(name)").order("at", { ascending: false }).limit(15),
    listBrands(),
    planUsage(),
  ]);
  const brandOpts = brands.map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <PageHeader title="Equipo" subtitle="Quién entra a tu espacio, con qué rol y qué marcas ve. Invitá con un link: la persona crea su contraseña y entra." />
      <div className="grid-2">
        <div className="stack">
          {usage && (
            <div className="card" data-testid="plan-usage">
              <h2 className="card-title">Tu plan: {usage.plan_name}</h2>
              <div className="facts" style={{ margin: 0 }}>
                <span>Marcas</span><b style={{ fontWeight: 500 }}>{usage.brands} de {usage.max_brands}</b>
                <span>Personas</span><b style={{ fontWeight: 500 }} data-testid="plan-members">{usage.members} de {usage.max_members}, con las invitaciones pendientes</b>
                <span>Acciones con IA</span><b style={{ fontWeight: 500 }}>{usage.ai_used} de {usage.ai_per_month} este mes</b>
                <span>Archivos</span><b style={{ fontWeight: 500 }}>{fmtSize(Number(usage.storage_bytes))} de {fmtSize(usage.max_storage_mb * 1048576)}</b>
              </div>
              <p className="hint" style={{ margin: "10px 0 0" }}>Cada vez que la IA genera, adapta, arma un plan, investiga o analiza cuenta una. Sin cupo, todo sigue andando con reglas y plantillas. Para cambiar de plan, escribinos.</p>
            </div>
          )}
          <InviteForm brands={brandOpts} />
          <div className="card">
            <h2 className="card-title">Roles</h2>
            <div className="facts" style={{ margin: 0 }}>
              {ROLES.map((r) => <Fragment key={r}><span>{r}</span><b style={{ fontWeight: 500 }}>{ROLE_HELP[r]}</b></Fragment>)}
            </div>
            <p className="hint" style={{ margin: "10px 0 0" }}>Para una agencia: al cliente dale el rol Revisor y elegí sus marcas. Solo ve esas marcas, sus piezas, campañas y métricas, y aprueba o pide cambios.</p>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2 className="card-title">Personas</h2>
            <div className="stack" style={{ gap: 0 }} data-testid="members">
              {((members ?? []) as Member[]).map((m) => (
                <MemberRow key={m.id} member={m} brands={brandOpts} isMe={m.id === user.id} label={brandsLabel(m.role, m.brand_ids, brandOpts)} />
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="card-title">Invitaciones pendientes</h2>
            {!invites?.length ? <div className="empty" style={{ padding: 16 }}>No hay invitaciones esperando.</div> : (
              <div className="stack" style={{ gap: 0 }} data-testid="invites">
                {(invites as Invitation[]).map((i) => (
                  <InvitationRow key={i.id} id={i.id} email={i.email} detail={`${i.role} · ${brandsLabel(i.role, i.brand_ids, brandOpts)} · vence en ${daysLeft(i.expires_at)} días`} link={inviteLink(origin, i.token)} />
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Historial</h2>
            {!events?.length ? <div className="empty" style={{ padding: 16 }}>Sin movimientos todavía.</div> : (
              <div className="timeline" data-testid="team-history">
                {(events as unknown as Event[]).map((e) => <div key={e.id}><b>{e.action}{e.profiles ? ` · ${e.profiles.name}` : ""}</b><span>{fmtDateTime(e.at)}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
