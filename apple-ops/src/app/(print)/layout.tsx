import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/session";

// Comprobantes imprimibles: sin menú, ancho de ticket.
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await getCurrentUser();
  return <div className="ticket">{children}</div>;
}
