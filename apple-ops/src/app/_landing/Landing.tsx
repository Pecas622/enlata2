import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/icons";
import type { Prices } from "@/lib/billing";
import { BRAND, splitProduct } from "@/lib/brand";
import { BASE_INCLUDES, MODULE_INFO, MODULES } from "@/lib/modules";
import { fmtARS } from "@/lib/money";
import { waLink } from "@/lib/whatsapp";
import s from "./landing.module.css";

// Landing de venta. Sigue la presentación comercial: problema → qué es → mostrador → vender afuera →
// confianza → precio → próximo paso. Solo cuenta lo que el sistema hace hoy (ver marketing/AGENTS.md).

const PROBLEMS = [
  ["Stock en planillas", "Cuesta saber qué IMEI se vendió, cuánto costó y hace cuántos días está parado."],
  ["Canje a ojo", "Cada vendedor tasa distinto y el margen se escapa en el usado que entra."],
  ["Caja que no cierra", "Dólares, pesos, transferencias y tarjetas mezclados, sin saber dónde está la diferencia."],
  ["WhatsApp a toda hora", "“¿Cuánto me dan por mi iPhone?” “¿Tenés el 15 Pro?” Las mismas preguntas, todo el día."],
];

const FEATURES = [
  {
    id: "canje", eyebrow: "Plan canje", title: "El usado se tasa solo, siempre con la misma regla",
    img: "/landing/canje.webp", h: 956, alt: "Tasación de un iPhone 13 128GB usado: valor de referencia, ajuste por condición y batería, diferencia a pagar",
    points: [
      "Valor de referencia del modelo, ajustado por condición, batería y defectos. Con el detalle a la vista.",
      "Si tiene iCloud activo o el IMEI con denuncia, el sistema no deja tomarlo.",
      "El vendedor no puede pagar más que el valor sugerido. El equipo entra solo al stock y la diferencia queda en la venta y en la caja.",
    ],
  },
  {
    id: "stock", eyebrow: "Stock de equipos", title: "Cada iPhone con su IMEI",
    img: "/landing/stock.webp", h: 1195, alt: "Stock de equipos con IMEI, batería, origen, días en stock, costo y precio",
    points: [
      "IMEI, condición, batería, origen y días en stock de cada iPhone, iPad, Mac, Watch o AirPods.",
      "Ingreso de equipos de proveedor o de particulares, con boleto de compra para imprimir.",
      "Los equipos parados se marcan solos y el stock se exporta a CSV.",
    ],
  },
  {
    id: "caja", eyebrow: "Caja", title: "Arqueo ciego: la diferencia aparece sola",
    img: "/landing/caja.webp", h: 1195, alt: "Caja abierta vista por el cajero, con movimientos del turno e historial de cierres",
    points: [
      "Apertura, movimientos por medio de pago y cierre por turno, en pesos y en dólares.",
      "El cajero cuenta sin ver cuánto debería haber. Al cerrar se ve si cuadra o hay diferencia.",
      "Reporte de cierre imprimible e historial de todos los turnos.",
    ],
  },
  {
    id: "dashboard", eyebrow: "Dashboard", title: "Tu local en una pantalla, desde el celular",
    img: "/landing/dashboard-panel.webp", h: 1115, alt: "Dashboard con ventas y ganancia del día, stock, caja, canjes y alertas",
    points: [
      "Ventas y ganancia del día, capital en stock, estado de la caja y canjes del mes.",
      "“Para atender”: accesorios a reponer y equipos que llevan muchos días parados.",
      "Reportes por período y por vendedor, con exportación a CSV.",
    ],
  },
];

const ROLES: [string, string, string, string, string][] = [
  ["Vender y cobrar", "Sí", "Sí", "Sí", "Sí"],
  ["Ver costos y ganancia", "Sí", "Sí", "No", "No"],
  ["Anular ventas", "Sí", "Sí", "No", "No"],
  ["Abrir y cerrar caja", "Sí", "Sí", "No", "A ciegas"],
  ["Usuarios y configuración", "Sí", "No", "No", "No"],
];

const TRUST = [
  ["Dólares y pesos", "Equipos en dólares, accesorios en pesos y la cotización del día. Cobro mixto sin calculadora."],
  ["Nada que instalar", "Funciona en el navegador: en la compu del mostrador o en el celular."],
  ["Todo queda registrado", "Ventas, anulaciones, ingresos y caja con usuario y hora. Anular revierte stock, caja y canje."],
  ["Tus datos protegidos", "Los permisos se aplican en la base de datos. Lo público nunca muestra costos, IMEI ni clientes."],
];

const FAQ = [
  ["¿Tengo que instalar algo?", "No. Entrás desde el navegador de la compu o del celular, con tu email. Para cambiar de usuario en el mostrador alcanza con un PIN de 4 números."],
  ["¿Factura electrónica?", "No. Los comprobantes que imprime son sin validez fiscal."],
  ["¿Mis vendedores ven los costos?", "No. El vendedor ve el precio; vos y tu encargado ven costos y ganancia. El cajero cuenta la caja sin ver cuánto debería haber."],
  ["¿Cómo pago?", "Con Mercado Pago, todos los meses. Los módulos los sumás desde el sistema cuando los necesitás, y se activan apenas se confirma el pago."],
  ["¿Puedo dejar de usarlo?", "Sí, cancelás la suscripción cuando quieras. Si el plan se da de baja, el local queda suspendido y lo que cargaste sigue guardado por si volvés."],
  ["¿El asistente inventa precios?", "No. Busca en tu stock real y cotiza el canje con la misma regla del mostrador, siempre como valor orientativo. Ante reclamos, descuentos o cuotas, deriva a una persona por WhatsApp."],
];

function ProductName({ dark = false }: { dark?: boolean }) {
  const [a, b] = splitProduct();
  return <span className={s.product}>{a}{b && <span className={dark ? s.accentDark : s.accent}>{b}</span>}</span>;
}

function Shot({ src, alt, w, h, phone = false }: { src: string; alt: string; w: number; h: number; phone?: boolean }) {
  return (
    <div className={phone ? s.phone : s.window}>
      {!phone && <div className={s.windowBar}><i /><i /><i /></div>}
      <Image src={src} alt={alt} width={w} height={h} sizes={phone ? "(max-width: 820px) 70vw, 320px" : "(max-width: 820px) 100vw, 720px"} className={s.shotImg} />
    </div>
  );
}

export function Landing({ prices }: { prices: Prices }) {
  const demo = BRAND.salesWhatsapp ? waLink(BRAND.salesWhatsapp, `Hola, quiero ver una demo de ${BRAND.product} para mi local.`) : "";
  const base = prices.base ? fmtARS(prices.base) : "";
  return (
    <div className={s.page} data-testid="landing">
      <header className={s.nav}>
        <div className={s.navInner}>
          <Link href="/" className={s.logo}><Logo size={30} /><ProductName /></Link>
          <nav className={s.navLinks}>
            <a href="#funciones">Funciones</a>
            <a href="#precios">Precios</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className={s.navCta}>
            <Link href="/login" className={s.navLogin}>Ingresar</Link>
            <Link href="/alta" className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} data-testid="landing-cta-nav">Empezá ahora</Link>
          </div>
        </div>
      </header>

      <section className={s.hero}>
        <div className={s.wrap}>
          <p className={s.eyebrowDark}>Para locales que venden iPhone y productos Apple</p>
          <h1 className={s.heroTitle}>Controlá tu local<br />aunque no estés.</h1>
          <p className={s.heroSub}>Canje tasado siempre igual, caja que cuadra, stock con IMEI y catálogo online. Todo en un solo sistema, en dólares y en pesos.</p>
          <div className={s.ctaRow}>
            <Link href="/alta" className={`${s.btn} ${s.btnPrimary}`} data-testid="landing-cta-hero">Empezá ahora</Link>
            {demo
              ? <a href={demo} className={`${s.btn} ${s.btnGhostDark}`} target="_blank" rel="noopener" data-testid="landing-demo">Pedí una demo por WhatsApp</a>
              : <a href="#funciones" className={`${s.btn} ${s.btnGhostDark}`}>Ver cómo funciona</a>}
          </div>
          {base && <p className={s.heroNote} data-testid="landing-desde">Desde {base} por mes · Sin instalar nada · Cancelás cuando quieras</p>}
          <div className={s.heroShot}>
            <Shot src="/landing/dashboard.webp" alt="Dashboard con ventas, ganancia, stock, caja y alertas del local" w={1600} h={1000} />
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <p className={s.eyebrow}>El día a día de un local de iPhone</p>
          <h2 className={s.h2}>Mucha plata en el mostrador, poco control</h2>
          <div className={s.grid4}>
            {PROBLEMS.map(([t, d]) => (
              <div className={s.card} key={t}><h3 className={s.h3}>{t}</h3><p className={s.body}>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionWhite}`} id="funciones">
        <div className={s.wrap}>
          <p className={s.eyebrow}>Qué es <ProductName /></p>
          <h2 className={s.h2}>Un solo sistema, del mostrador a la vidriera online</h2>
          {FEATURES.map((f, i) => (
            <div className={`${s.feature} ${i % 2 ? s.featureFlip : ""}`} key={f.id} id={f.id}>
              <div className={s.featureText}>
                <p className={s.eyebrow}>{f.eyebrow}</p>
                <h3 className={s.featureTitle}>{f.title}</h3>
                <ul className={s.points}>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              <div className={s.featureShot}><Shot src={f.img} alt={f.alt} w={1600} h={f.h} /></div>
            </div>
          ))}

          <div className={s.roles} id="roles">
            <div className={s.featureText}>
              <p className={s.eyebrow}>Usuarios y roles</p>
              <h3 className={s.featureTitle}>Tu vendedor ve el precio, vos ves la ganancia</h3>
              <p className={s.body}>Cuatro roles con permisos aplicados en la base de datos, no solo en la pantalla. Cada venta, anulación y movimiento de caja queda con nombre y hora.</p>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Permiso</th><th>Administrador</th><th>Encargado</th><th>Vendedor</th><th>Cajero</th></tr></thead>
                <tbody>
                  {ROLES.map(([p, ...r]) => (
                    <tr key={p}><td>{p}</td>{r.map((v, i) => <td key={i} className={v === "No" ? s.no : s.yes}>{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className={s.statement}>
        <div className={`${s.wrap} ${s.statementInner}`}>
          <div className={s.statementText}>
            <p className={s.eyebrowLight}>Catálogo online y asistente</p>
            <h2 className={s.statementTitle}>Tu local sigue atendiendo cuando bajás la persiana.</h2>
            <ul className={s.pointsLight}>
              <li>Una página pública con tus equipos y accesorios, tomados del mismo stock. Lo que se vende, desaparece.</li>
              <li>“Cotizá tu iPhone”: el cliente ve cuánto vale su usado, como valor orientativo.</li>
              <li>Un asistente de chat responde stock, precios y canje al instante, sin inventar, y pasa a una persona por WhatsApp cuando hace falta.</li>
            </ul>
          </div>
          <div className={s.phones}>
            <Shot src="/landing/catalogo.webp" alt="Catálogo público del local en el celular" w={780} h={1688} phone />
            <Shot src="/landing/asistente.webp" alt="Asistente de chat cotizando un iPhone 13 de 128GB" w={780} h={1688} phone />
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <p className={s.eyebrow}>Por qué confiar</p>
          <h2 className={s.h2}>Hecho para la realidad de un local argentino</h2>
          <div className={s.grid4}>
            {TRUST.map(([t, d]) => (
              <div key={t} className={s.trust}><h3 className={s.h3}>{t}</h3><p className={s.body}>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionWhite}`} id="precios">
        <div className={s.wrap}>
          <p className={s.eyebrow}>Precios</p>
          <h2 className={s.h2}>Empezá con la base y sumá lo que necesites</h2>
          <div className={s.pricing}>
            <div className={s.planCard} data-testid="landing-plan-base">
              <p className={s.eyebrow}>Plan base</p>
              <p className={s.price}>{base || "—"}<span>/mes</span></p>
              <p className={s.body}>{BASE_INCLUDES}</p>
              <Link href="/alta" className={`${s.btn} ${s.btnPrimary} ${s.btnBlock}`} data-testid="landing-cta-precio">Empezá ahora</Link>
              <p className={s.small}>Pagás con Mercado Pago, todos los meses. Cancelás cuando quieras.</p>
            </div>
            <div className={s.modules}>
              <h3 className={s.h3}>Módulos que se suman</h3>
              {MODULES.map((m) => (
                <div className={s.moduleRow} key={m} data-testid={`landing-mod-${m}`}>
                  <div><b>{MODULE_INFO[m].label}</b><p className={s.small}>{MODULE_INFO[m].desc}</p></div>
                  <span className={s.modPrice}>{prices[m] ? `+${fmtARS(prices[m])}` : ""}</span>
                </div>
              ))}
              <p className={s.small}>Los sumás desde el sistema cuando los necesitás y se activan al confirmarse el pago. Precios en pesos, por mes.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section} id="preguntas">
        <div className={`${s.wrap} ${s.narrow}`}>
          <h2 className={s.h2}>Preguntas frecuentes</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className={s.faq}><summary>{q}</summary><p className={s.body}>{a}</p></details>
          ))}
        </div>
      </section>

      <section className={s.final}>
        <div className={s.wrap}>
          <h2 className={s.finalTitle}>Ordená tu local desde hoy.</h2>
          <p className={s.heroSub}>Creás tu cuenta en un minuto y empezás a cargar tu stock.</p>
          <div className={s.ctaRow}>
            <Link href="/alta" className={`${s.btn} ${s.btnPrimary}`} data-testid="landing-cta-final">Empezá ahora</Link>
            {demo && <a href={demo} className={`${s.btn} ${s.btnGhostDark}`} target="_blank" rel="noopener">Pedí una demo por WhatsApp</a>}
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <p><ProductName dark /> es un producto de {BRAND.company}. Software que ya viene listo.</p>
          <p>Apple, iPhone, iPad, Mac, Apple Watch y AirPods son marcas de Apple Inc. {BRAND.product} no está afiliado ni respaldado por Apple Inc.</p>
          <p><Link href="/login">Ingresar</Link> · <Link href="/alta">Crear cuenta</Link></p>
        </div>
      </footer>
    </div>
  );
}
