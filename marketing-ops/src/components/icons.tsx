import type { ReactElement } from "react";

const ACCENT = "#5E5CE6";

// La lata de Enlata2 con un megáfono adentro.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <rect x="18" y="10" width="64" height="80" rx="20" stroke={ACCENT} strokeWidth="6" />
      <path d="M33 45h8l16-10v30L41 55h-8z" fill={ACCENT} />
      <path d="M63 42c3 2 4.5 5 4.5 8s-1.5 6-4.5 8" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

const PATHS: Record<string, ReactElement> = {
  inicio: <g><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></g>,
  generar: <g><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z" /></g>,
  contenidos: <g><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></g>,
  marca: <g><path d="M4 12.5V5a1 1 0 0 1 1-1h7.5l7.5 7.5-8.5 8.5L4 12.5z" /><circle cx="8.5" cy="8.5" r="1.5" /></g>,
  calendario: <g><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></g>,
  campanas: <g><path d="M4 10v4h3l8 5V5L7 10H4z" /><path d="M18 9.5a4 4 0 0 1 0 5" /></g>,
  metricas: <g><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></g>,
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
