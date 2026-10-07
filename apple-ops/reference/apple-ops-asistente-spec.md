# Asistente de chat de APPLE OPS — especificación para conectar la IA real

## Qué hay hoy
El catálogo público (`#/catalogo`) tiene un botón flotante "Preguntanos" que abre un chat. Por defecto usa un **motor simulado** (reglas) que:
- Busca equipos y accesorios en el **stock real** (solo disponibles y visibles) y muestra tarjetas con precio y foto.
- Cotiza el **plan canje** paso a paso (modelo → capacidad → estado → batería) con la misma tasación del sistema, como rango orientativo.
- Responde pagos, garantía y ubicación con los datos de Configuración.
- Deriva a una persona por **WhatsApp** con un resumen de la conversación.
- Registra cada conversación en Catálogo → Asistente de chat (tema, último mensaje, si se derivó).

## Conectar una IA real
En el panel: Catálogo → Asistente de chat → "URL del servidor de IA". Si está cargada, el chat le envía cada mensaje; si el servidor falla o tarda más de 12 s, el chat vuelve solo al motor simulado.

### Contrato
`POST <endpoint>` con `Content-Type: application/json`

Request:
```json
{ "store": "Nombre del local",
  "messages": [ { "role": "user", "content": "tenés iPhone 15?" },
                { "role": "assistant", "content": "..." } ] }
```
Response (200):
```json
{ "reply": "texto para el cliente", "handoff": false, "deviceIds": ["d5", "d9"] }
```
- `handoff: true` muestra el botón "Continuar por WhatsApp".
- `deviceIds` muestra tarjetas de esos equipos (ids del stock).
- Hay que habilitar CORS para el dominio del catálogo.

## Reglas para el servidor (prompt base)
1. La clave de la API de IA vive **solo en el servidor**, nunca en el navegador.
2. El servidor consulta el stock actual (equipos disponibles y visibles, accesorios con stock) y se lo pasa al modelo como contexto o como herramienta (`buscar_stock`, `cotizar_canje`).
3. Nunca inventar precios, disponibilidad ni garantías: solo lo que devuelven las herramientas.
4. Nunca mostrar costos, márgenes, IMEI ni datos de clientes.
5. Toda cotización de canje es orientativa y se confirma en el local.
6. Derivar a una persona ante: reclamos, descuentos, cuotas/recargos, equipos sin referencia de precio, o cuando el cliente lo pida.
7. Tono: español rioplatense, voseo, breve y cordial.

## Para llevarlo a producción
- Hoy los datos viven en el navegador del local (demo). Para que el catálogo muestre stock en vivo a cualquier visitante hace falta un backend (base de datos + API); el mismo backend aloja el endpoint del asistente.
- Para atender también por WhatsApp/Instagram: WhatsApp Business API (proveedor oficial) apuntando al mismo endpoint, con derivación a una persona.
- Cargar el WhatsApp de ventas real en Catálogo → Textos y contacto.
