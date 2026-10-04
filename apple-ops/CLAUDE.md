# APPLE OPS — producción (Enlata2)

Software de gestión para locales de venta de productos Apple: stock con IMEI, plan canje, accesorios, usuarios, cierres de caja y catálogo público con asistente de chat. Marca: Enlata2, "Software que ya viene listo": 80% hecho, 20% a medida. Cada producto se llama "OPS lata".

## Punto de partida
- `reference/apple-ops-full.jsx`: prototipo funcional completo (un solo archivo React, datos en localStorage). Es la fuente de verdad de pantallas, flujos y reglas. Portalo, no lo reinventes.
- `reference/apple-ops-asistente-spec.md`: contrato del endpoint del asistente y reglas del prompt.

## Stack
Next.js (App Router) + TypeScript + Postgres vía Supabase (Auth + RLS) + Vercel. API de Anthropic solo desde el servidor. Tests con Playwright.

## Reglas de negocio (no negociables)
- Idioma de la interfaz: español rioplatense (voseo).
- Equipos en USD, accesorios en ARS. Cotización del día en `config.fx`; toda conversión pasa por una sola función `toUSD`.
- Tasación del canje: valor base × multiplicador de estado − penalidad de batería − costos de defectos, redondeado a múltiplos de 5. Equipos con iCloud activo o IMEI bloqueado se rechazan. Replicar `appraise()` del prototipo.
- Ingreso de canje: el equipo entra al stock al valor tasado y la diferencia la paga el cliente. Debe quedar registrado en la venta y en caja.
- Roles: Administrador, Encargado, Vendedor, Cajero. Permisos por `permsFor(role)`. Vendedor no ve costos ni márgenes. El Cajero hace el conteo de caja a ciegas (no ve el esperado).
- Cierre de caja: apertura, movimientos por método de pago, conteo, diferencia, reporte imprimible. Una sola caja abierta por vez.
- Anular una venta revierte stock, caja y canje. Todo cambio relevante va al log con usuario y hora.
- Fechas: día local de Argentina (America/Argentina/Mendoza), nunca UTC pelado.
- Comprobantes: "sin validez fiscal" salvo integración fiscal explícita.
- Catálogo público: solo equipos "Disponible" y visibles. NUNCA exponer costos, IMEI, datos de clientes ni márgenes (verificar con test).
- Asistente: la clave de IA vive solo en el servidor. Nunca inventa precios ni disponibilidad: usa herramientas `buscar_stock` y `cotizar_canje`. Cotizaciones siempre "orientativas". Deriva a una persona ante reclamos, descuentos, cuotas o equipos sin referencia.

## Estilo visual
Paleta y tipografía de Apple (fondo claro, azul #0071E3, verde #248A3D, fuente del sistema SF). Mantener el aspecto del prototipo.

## Forma de trabajar
- Por etapas; cada etapa se prueba antes de seguir y se resume en 3 líneas.
- Reglas de React: todos los hooks antes de cualquier return condicional.
- Lógica de negocio en funciones puras con tests (tasación, ventas, anulaciones, caja).
- Nunca commitear secretos. Variables en `.env.local` y en Vercel.
