import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parsePrices } from "@/lib/billing";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "./_landing/Landing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND.product} · Sistema de gestión para locales de iPhone`,
  description: "Stock con IMEI, plan canje tasado siempre igual, caja con arqueo ciego y catálogo online. Controlá tu local aunque no estés.",
  openGraph: {
    title: `${BRAND.product} · Controlá tu local aunque no estés`,
    description: "El sistema de gestión hecho para locales que venden iPhone y productos Apple.",
    images: ["/landing/dashboard.webp"],
  },
};

// Con sesión, directo al sistema. Sin sesión, la landing de venta con los precios vigentes.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const { data } = await supabase.from("plan_prices").select("item, price_ars");
  return <Landing prices={parsePrices(data)} />;
}
