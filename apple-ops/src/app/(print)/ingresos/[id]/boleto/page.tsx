import { notFound } from "next/navigation";
import { fmtDateTime } from "@/lib/dates";
import { requireSection } from "@/lib/guard";
import { fmtUSD } from "@/lib/money";
import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

export default async function BoletoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSection("ingresos");
  const supabase = await createClient();
  const [cfg, { data: p }] = await Promise.all([
    loadStoreConfig(supabase),
    supabase.from("purchases").select("number, at, person_name, person_dni, cost_usd, devices(model, capacity, color, imei)").eq("id", id).maybeSingle(),
  ]);
  if (!p) notFound();
  const d = p.devices as unknown as { model: string; capacity: number; color: string; imei: string };
  return (
    <>
      <h1>{cfg.name}</h1>
      <div className="s">CUIT {cfg.cuit}<br />{cfg.address}</div>
      <hr />
      <div className="b" data-testid="boleto-number">Boleto de compra {p.number}</div>
      <div className="s">{fmtDateTime(p.at)}</div>
      <hr />
      <table>
        <tbody>
          <tr><td>Vendedor</td><td className="r">{p.person_name || "-"}</td></tr>
          <tr><td>DNI</td><td className="r">{p.person_dni || "-"}</td></tr>
          <tr><td>Equipo</td><td className="r">{d.model}{d.capacity ? ` ${d.capacity}GB` : ""} · {d.color}</td></tr>
          <tr><td>IMEI / serie</td><td className="r">{d.imei}</td></tr>
          <tr><td className="b">Valor abonado</td><td className="r b">{fmtUSD(Number(p.cost_usd))}</td></tr>
        </tbody>
      </table>
      <hr />
      <div className="s">
        El vendedor declara ser titular del equipo, que está libre de bloqueos, denuncias y de iCloud, y que lo vende por su propia voluntad.
        <br /><br /><br />Firma vendedor: ________________
      </div>
      <div className="s" style={{ marginTop: 14 }}>Documento sin validez fiscal.</div>
      <PrintButton />
    </>
  );
}
