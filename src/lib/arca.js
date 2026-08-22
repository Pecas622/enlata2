// ============================================================================
// Cliente de Facturación Electrónica ARCA (ex AFIP) — MODO SIMULADO
// ============================================================================
//
// Este archivo es la "puerta" por la que todos los módulos de Enlata2 piden
// la emisión de un comprobante fiscal. Hoy, como Enlata2 corre 100% en el
// navegador (sin backend ni base de datos real — ver src/storage-polyfill.js),
// no es posible ni seguro conectar de verdad contra los webservices de ARCA:
// eso requiere firmar pedidos con el certificado privado de cada negocio, y
// un certificado privado NUNCA debe viajar al navegador del cliente final.
//
// Por eso esta versión SIMULA la respuesta de ARCA: genera un número de
// comprobante correlativo y un CAE con el mismo formato que el real, para que
// el resto del producto (UI, checkout, demos) pueda funcionar y venderse ya
// mismo. Ningún comprobante emitido acá es válido ante ARCA.
//
// --------------------------------------------------------------------------
// QUÉ HACE FALTA PARA PASAR ESTO A UNA INTEGRACIÓN REAL (etapa 2)
// --------------------------------------------------------------------------
// 1. Backend propio (hoy no existe ninguno). Por ejemplo funciones
//    serverless de Vercel, ya que el proyecto se despliega ahí. Todo el
//    intercambio con ARCA tiene que pasar por ese backend, nunca por el
//    navegador.
// 2. Base de datos real por negocio (hoy todo vive en localStorage del
//    navegador, que no es seguro ni compartido entre dispositivos). Ahí se
//    guardaría, encriptado, el certificado y la clave privada de cada CUIT.
// 3. Por cada negocio cliente de Enlata2:
//      - Clave Fiscal nivel 3 en el sitio de ARCA.
//      - Generar un certificado (CSR) y asociarlo al Web Service de
//        Facturación Electrónica desde el portal de ARCA.
//      - Subir ese certificado a Enlata2 (nunca compartir la clave fiscal).
// 4. Flujo real de dos pasos, ambos del lado del backend:
//      - WSAA (autenticación): firma un "ticket de acceso" con el
//        certificado del negocio y ARCA devuelve un Token + Sign válidos
//        por 12 horas.
//      - WSFEv1 (facturación): con ese Token/Sign, se pide el último
//        comprobante autorizado y se solicita el CAE del próximo.
// 5. Ambiente de homologación (testing) primero, con URLs y certificados
//    propios separados de producción, antes de facturar de verdad.
// 6. Reemplazar la función `emitirComprobante` de este archivo por una
//    llamada a ese backend (p. ej. `POST /api/arca/emitir`). El resto de la
//    app (Facturacion.jsx y cada Ops) no debería tener que cambiar, porque
//    ya está escrito contra esta misma función.
// --------------------------------------------------------------------------

export const ARCA_MODO_SIMULADO = true;

export const TIPOS_COMPROBANTE = [
  { id: "B", label: "Factura B", desc: "Consumidor final / Monotributo" },
  { id: "A", label: "Factura A", desc: "Entre responsables inscriptos" },
  { id: "C", label: "Factura C", desc: "Emitida por Monotributista" },
];

export const CONDICIONES_IVA = [
  "Consumidor Final",
  "Responsable Inscripto",
  "Monotributo",
  "Exento",
];

function pad(n, len) {
  return String(n).padStart(len, "0");
}

// Genera un CAE con el mismo formato que ARCA (14 dígitos numéricos).
function generarCAESimulado() {
  let cae = "";
  for (let i = 0; i < 14; i++) cae += Math.floor(Math.random() * 10);
  return cae;
}

// Punto de venta simulado, fijo para toda la demo (ARCA usa 4 dígitos).
export const PUNTO_VENTA_DEMO = "0001";

// Calcula el próximo número correlativo para un tipo de comprobante, a
// partir de las facturas ya emitidas (simula lo que en la vida real
// contesta ARCA al preguntar "cuál fue el último comprobante autorizado").
export function proximoNumero(facturas, tipo) {
  const delTipo = (facturas || []).filter((f) => f.tipo === tipo);
  const ultimo = delTipo.reduce((max, f) => Math.max(max, Number(f.numero) || 0), 0);
  return ultimo + 1;
}

// Simula la emisión de un comprobante contra ARCA. Devuelve una Promise
// para que el resto del código ya esté escrito de forma asíncrona, tal
// como se comportaría la llamada real al backend.
export async function emitirComprobante({ tipo, numero, cliente, cuitCliente, condicionIVA, detalle, total }) {
  // Simula la latencia de red + procesamiento que tendría el backend real.
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));

  const hoy = new Date();
  const vencimiento = new Date(hoy);
  vencimiento.setDate(vencimiento.getDate() + 10);

  return {
    ok: true,
    modo: "simulado",
    tipo,
    puntoVenta: PUNTO_VENTA_DEMO,
    numero,
    numeroFormateado: `${PUNTO_VENTA_DEMO}-${pad(numero, 8)}`,
    cliente,
    cuitCliente: cuitCliente || "",
    condicionIVA,
    detalle,
    total,
    cae: generarCAESimulado(),
    caeVencimiento: vencimiento.toISOString().slice(0, 10),
    fecha: hoy.toISOString().slice(0, 10),
  };
}
