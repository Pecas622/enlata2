// Roles y menú. Los permisos reales se aplican en la base (funciones SQL y RLS); esto decide qué se muestra.
export const ROLES = ["Administrador", "Creador", "Revisor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HELP: Record<Role, string> = {
  Administrador: "Todo: marcas, contenidos, aprobación y equipo.",
  Creador: "Genera, escribe y manda a revisión. Marca como publicada lo aprobado.",
  Revisor: "El dueño o el cliente: lee, aprueba o pide cambios. No edita.",
};

export type Perms = { editBrand: boolean; create: boolean; review: boolean };

export function permsFor(role: Role): Perms {
  return {
    editBrand: role === "Administrador",
    create: role === "Administrador" || role === "Creador",
    review: role === "Administrador" || role === "Revisor",
  };
}

export type NavItem = { id: string; label: string; icon: string; roles: readonly Role[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "inicio", label: "Inicio", icon: "inicio", roles: ROLES },
  { id: "investigar", label: "Investigar", icon: "investigar", roles: ["Administrador", "Creador"] },
  { id: "generar", label: "Generar contenido", icon: "generar", roles: ["Administrador", "Creador"] },
  { id: "contenidos", label: "Contenidos", icon: "contenidos", roles: ROLES },
  { id: "calendario", label: "Calendario", icon: "calendario", roles: ROLES },
  { id: "campanas", label: "Campañas", icon: "campanas", roles: ROLES },
  { id: "metricas", label: "Métricas", icon: "metricas", roles: ROLES },
  { id: "marca", label: "Marcas", icon: "marca", roles: ROLES },
];

// Lo que viene en las próximas etapas. Se muestra atenuado para que el cliente vea hacia dónde va.
export const NEXT_ITEMS: readonly { label: string; icon: string }[] = [];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function canOpen(role: Role, section: string): boolean {
  return navFor(role).some((item) => item.id === section);
}
