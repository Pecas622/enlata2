import type { ReactElement } from "react";

const ACCENT = "#0071E3";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <rect x="18" y="10" width="64" height="80" rx="20" stroke={ACCENT} strokeWidth="6" />
      <rect x="34" y="34" width="32" height="6" rx="3" fill={ACCENT} />
      <rect x="34" y="47" width="32" height="6" rx="3" fill={ACCENT} />
      <rect x="34" y="60" width="32" height="6" rx="3" fill={ACCENT} />
    </svg>
  );
}

const PATHS: Record<string, ReactElement> = {
  dashboard: <g><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></g>,
  alertas: <g><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></g>,
  ventas: <g><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></g>,
  canje: <g><path d="M4 8h14m0 0-3-3m3 3-3 3" /><path d="M20 16H6m0 0 3-3m-3 3 3 3" /></g>,
  stock: <g><rect x="7" y="2.5" width="10" height="19" rx="2.6" /><path d="M11 18.5h2" /></g>,
  ingresos: <g><path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M5 20h14" /></g>,
  accesorios: <g><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14.5" width="4" height="6" rx="1.6" /><rect x="16.5" y="14.5" width="4" height="6" rx="1.6" /></g>,
  catalogo: <g><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3.2 3.2 3.2 14.8 0 18" /><path d="M12 3c-3.2 3.2-3.2 14.8 0 18" /></g>,
  clientes: <g><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6" /></g>,
  caja: <g><rect x="2.5" y="6" width="19" height="12" rx="2.4" /><circle cx="12" cy="12" r="2.8" /></g>,
  reportes: <g><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></g>,
  usuarios: <g><path d="M12 3l8 3v6c0 4.8-3.4 7.9-8 9-4.6-1.1-8-4.2-8-9V6l8-3z" /></g>,
  config: <g><path d="M4 7h9m4 0h3" /><path d="M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></g>,
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
