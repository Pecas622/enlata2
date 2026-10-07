// Roles, permisos y menú, portados de permsFor() y NAV_ITEMS del prototipo.
export const ROLES = ["Administrador", "Encargado", "Vendedor", "Cajero"] as const;
export type Role = (typeof ROLES)[number];

export type Perms = {
  seeCost: boolean;
  editPrice: boolean;
  voidSale: boolean;
  overTradeIn: boolean;
  editStock: boolean;
  seeAllShifts: boolean;
  manageUsers: boolean;
  blindCount: boolean;
};

export function permsFor(role: Role): Perms {
  const admin = role === "Administrador";
  const manager = admin || role === "Encargado";
  return {
    seeCost: manager,
    editPrice: manager,
    voidSale: manager,
    overTradeIn: manager,
    editStock: manager,
    seeAllShifts: manager,
    manageUsers: admin,
    blindCount: role === "Cajero",
  };
}

export type NavItem = { id: string; label: string; icon: string; roles: readonly Role[]; stage: number };

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ROLES, stage: 6 },
  { id: "alertas", label: "Alertas", icon: "alertas", roles: ["Administrador", "Encargado"], stage: 10 },
  { id: "ventas", label: "Ventas", icon: "ventas", roles: ROLES, stage: 3 },
  { id: "canje", label: "Plan Canje", icon: "canje", roles: ["Administrador", "Encargado", "Vendedor"], stage: 3 },
  { id: "stock", label: "Stock de equipos", icon: "stock", roles: ["Administrador", "Encargado", "Vendedor"], stage: 2 },
  { id: "ingresos", label: "Ingreso de equipos", icon: "ingresos", roles: ["Administrador", "Encargado"], stage: 2 },
  { id: "accesorios", label: "Accesorios", icon: "accesorios", roles: ROLES, stage: 4 },
  { id: "catalogo", label: "Catálogo online", icon: "catalogo", roles: ["Administrador", "Encargado"], stage: 7 },
  { id: "clientes", label: "Clientes", icon: "clientes", roles: ROLES, stage: 4 },
  { id: "caja", label: "Caja", icon: "caja", roles: ["Administrador", "Encargado", "Cajero"], stage: 5 },
  { id: "reportes", label: "Reportes", icon: "reportes", roles: ["Administrador", "Encargado"], stage: 6 },
  { id: "usuarios", label: "Usuarios y roles", icon: "usuarios", roles: ["Administrador"], stage: 6 },
  { id: "config", label: "Configuración", icon: "config", roles: ["Administrador"], stage: 6 },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function canOpen(role: Role, section: string): boolean {
  return navFor(role).some((item) => item.id === section);
}

// Matriz de permisos que se muestra en Usuarios y roles, calculada de las mismas reglas.
export const PERM_MATRIX: readonly [string, (r: Role) => boolean][] = [
  ["Ver costos y ganancia", (r) => permsFor(r).seeCost],
  ["Vender y cobrar", (r) => canOpen(r, "ventas")],
  ["Descuentos sin tope", (r) => permsFor(r).editPrice],
  ["Tomar canje sobre el valor sugerido", (r) => permsFor(r).overTradeIn],
  ["Editar precios y stock", (r) => permsFor(r).editStock],
  ["Ingresar equipos", (r) => canOpen(r, "ingresos")],
  ["Anular ventas", (r) => permsFor(r).voidSale],
  ["Abrir y cerrar caja", (r) => canOpen(r, "caja")],
  ["Ver todos los cierres", (r) => permsFor(r).seeAllShifts],
  ["Reportes", (r) => canOpen(r, "reportes")],
  ["Usuarios y configuración", (r) => permsFor(r).manageUsers],
];
