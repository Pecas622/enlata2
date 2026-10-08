// Cliente mínimo de la API de suscripciones de Mercado Pago. Solo corre en el servidor.
const API = process.env.MP_API_URL || "https://api.mercadopago.com";

export const mpConfigured = () => Boolean(process.env.MP_ACCESS_TOKEN);

async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${body.message ?? "sin detalle"}`);
  return body;
}

export type Preapproval = { id: string; status: string; external_reference: string; init_point?: string };

// Crea una suscripción mensual en pesos. Mercado Pago devuelve init_point, donde el cliente paga.
export function createPreapproval(p: { reason: string; payerEmail: string; amount: number; externalReference: string; backUrl: string }) {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: p.reason,
      payer_email: p.payerEmail,
      external_reference: p.externalReference,
      back_url: p.backUrl,
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: p.amount, currency_id: "ARS" },
    }),
  });
}

export const getPreapproval = (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
