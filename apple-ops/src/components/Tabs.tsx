import Link from "next/link";

// Pestañas por URL (?tab=...), para que cada vista se pueda abrir y recargar directo.
export function Tabs({ base, tabs, active }: { base: string; tabs: { id: string; label: string }[]; active: string }) {
  return (
    <div className="pills" style={{ margin: 0 }}>
      {tabs.map((t, i) => (
        <Link key={t.id} href={i === 0 ? base : `${base}?tab=${t.id}`} className={`pill${active === t.id ? " active" : ""}`} data-testid={`tab-${t.id}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
