# Facturación automática ARCA — estado y próximos pasos

## Qué hay hoy (etapa 1, ya implementada)

Se agregó un módulo de **Facturación** a las cuatro verticales activas del
catálogo (Apple Ops, Inmo Ops, Club Ops, Auto Ops). Desde ese módulo se puede
cargar un cliente, un detalle y un monto, elegir tipo de comprobante (A/B/C)
y "emitirlo": el sistema genera un número de comprobante correlativo y un
CAE con el mismo formato que usa ARCA, y muestra una vista imprimible del
comprobante.

Archivos relevantes:

- `src/lib/arca.js` — la función `emitirComprobante()` que simula la
  respuesta de ARCA (número, CAE, vencimiento de CAE). Tiene un comentario
  extenso al principio con el detalle técnico de lo que sigue en esta nota.
- `src/lib/Facturacion.jsx` — el componente de UI (alta de comprobante,
  listado, vista de impresión), reutilizado en las cuatro verticales.
- Integrado en `src/lib/GenericOps.jsx` (vía `products.js`, para Apple Ops) y
  directamente en `AutoOps.jsx`, `ClubOps.jsx` e `InmoOps.jsx`.

**Importante: es un modo simulado.** El propio módulo lo aclara con un
banner visible. Ningún comprobante generado ahí es válido ante ARCA — el
número y el CAE tienen el formato correcto para que la demo se vea completa,
pero no salen de ningún webservice real.

## Por qué no se conectó ya contra ARCA de verdad

Enlata2 hoy es una aplicación 100% frontend (React + Vite), desplegada como
sitio estático en Vercel. No tiene backend ni base de datos: todo se guarda
en el `localStorage` del navegador (ver `src/storage-polyfill.js`).

La emisión real de comprobantes requiere firmar pedidos con el certificado
digital y la clave privada del negocio emisor. Esa clave privada **no puede
viajar al navegador** del usuario final bajo ningún concepto — así que la
integración real necesita, sí o sí, un backend propio.

## Qué falta para la integración real (etapa 2)

1. **Backend.** Por ejemplo, funciones serverless de Vercel (encajan con el
   despliegue actual) o un servicio Node aparte. Todo el intercambio con
   ARCA debe pasar por ahí.
2. **Base de datos real por negocio**, para reemplazar `localStorage`.
   Ahí se guardaría — encriptado — el certificado y la clave privada de
   cada CUIT, más el historial real de comprobantes.
3. **Por cada negocio cliente de Enlata2:**
   - Clave Fiscal nivel 3 en el sitio de ARCA.
   - Generar un certificado (CSR) y asociarlo al Web Service de
     Facturación Electrónica desde el portal de ARCA.
   - Subir ese certificado a Enlata2 (nunca la clave fiscal en sí).
4. **Flujo real, del lado del backend:**
   - `WSAA` (autenticación): firma un ticket de acceso con el certificado
     del negocio; ARCA devuelve un Token + Sign válidos por 12hs.
   - `WSFEv1` (facturación): con ese Token/Sign, pide el último
     comprobante autorizado y solicita el CAE del próximo.
5. **Ambiente de homologación (testing)** primero, con URLs y certificados
   propios separados de producción.
6. Reemplazar `emitirComprobante()` en `src/lib/arca.js` por una llamada al
   nuevo backend (p. ej. `POST /api/arca/emitir`). El resto de la app
   (`Facturacion.jsx` y cada Ops) ya está escrito contra esa misma función,
   así que no debería necesitar cambios.

## Decisiones pendientes antes de arrancar la etapa 2

- Dónde vive el backend y la base de datos (Vercel Functions + Postgres/
  Supabase es la opción más natural dado el hosting actual, pero es una
  decisión a tomar).
- Cómo se sube y guarda el certificado de cada cliente de forma segura.
- Qué pasa con los comprobantes ya "emitidos" en modo simulado cuando un
  negocio pasa a modo real (probablemente: se archivan como demo, no se
  migran).
