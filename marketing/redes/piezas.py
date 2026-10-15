"""Piezas para redes de Enlata2: carruseles 1080x1350, foto de perfil y portadas de destacadas.

Uso: python3 piezas.py <carpeta de salida>
Lee las capturas de CAPTURAS (por defecto /mnt/project-files), con apple-ops/ y marketing-ops/ adentro.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]
SRC = os.environ.get('CAPTURAS', '/mnt/project-files')
FONT = '/usr/share/fonts/opentype/inter/'
W, H = 1080, 1350
CARBON = (11, 11, 13); CARD = (19, 19, 22); BORDER = (35, 35, 39)
LIME = (184, 255, 61); OFF = (245, 245, 240); GRAY = (138, 138, 138)

def font(name, size): return ImageFont.truetype(FONT + name, size)

def wrap(d, text, f, maxw):
    out = []
    for part in text.split('\n'):
        cur = ''
        for w in part.split():
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=f) <= maxw: cur = t
            else: out.append(cur); cur = w
        out.append(cur)
    return out

def block(d, xy, text, f, color, maxw, lh=1.12):
    x, y = xy
    for line in wrap(d, text, f, maxw):
        d.text((x, y), line, font=f, fill=color); y += int(f.size * lh)
    return y

def isotipo(im, cx, cy, s, color=LIME):
    """La lata del logo (viewBox 100x100 de la landing), centrada en cx, cy, de lado s."""
    k = s / 100; x0, y0 = cx - s / 2, cy - s / 2
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0 + 18 * k, y0 + 10 * k, x0 + 82 * k, y0 + 90 * k), radius=20 * k, outline=color, width=max(2, round(6 * k)))
    for yy in (34, 47, 60):
        d.rounded_rectangle((x0 + 34 * k, y0 + yy * k, x0 + 66 * k, y0 + (yy + 6) * k), radius=3 * k, fill=color)

def wordmark(im, x, y, size, center=False):
    d = ImageDraw.Draw(im); f = font('InterDisplay-Black.otf', size)
    w1 = d.textlength('ENLATA', font=f); w2 = d.textlength('2', font=f)
    if center: x = (im.width - w1 - w2) / 2
    d.text((x, y), 'ENLATA', font=f, fill=OFF); d.text((x + w1, y), '2', font=f, fill=LIME)

def shot(name, crop=None, maxw=960, maxh=640):
    im = Image.open(os.path.join(SRC, name)).convert('RGB')
    if crop:  # fracciones (izq, arriba, der, abajo)
        a, b, c, e = crop; im = im.crop((int(a * im.width), int(b * im.height), int(c * im.width), int(e * im.height)))
    r = min(maxw / im.width, maxh / im.height); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    mask = Image.new('L', im.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), 22, fill=255)
    return im, mask

def frame(n, total):
    im = Image.new('RGB', (W, H), CARBON); d = ImageDraw.Draw(im)
    isotipo(im, 96, 96, 64); f = font('Inter-SemiBold.otf', 28)
    d.text((W - 80 - d.textlength(f'{n}/{total}', font=f), 80), f'{n}/{total}', font=f, fill=GRAY)
    return im, d

def cover(n, total, eyebrow, title, sub):
    im, d = frame(n, total)
    d.text((80, 360), eyebrow, font=font('Inter-Bold.otf', 34), fill=LIME)
    y = block(d, (80, 420), title, font('InterDisplay-Black.otf', 104), OFF, 920, 1.02)
    block(d, (80, y + 40), sub, font('Inter-Medium.otf', 40), GRAY, 900, 1.3)
    d.text((80, H - 140), 'Deslizá  →', font=font('Inter-Bold.otf', 36), fill=OFF)
    return im

def feature(n, total, eyebrow, title, body, img, crop=None):
    im, d = frame(n, total)
    d.text((80, 190), eyebrow, font=font('Inter-Bold.otf', 30), fill=LIME)
    y = block(d, (80, 236), title, font('InterDisplay-Black.otf', 70), OFF, 920, 1.04)
    y = block(d, (80, y + 20), body, font('Inter-Medium.otf', 34), GRAY, 920, 1.3)
    s, m = shot(img, crop, 920, H - y - 110)
    x0 = (W - s.width) // 2; y0 = y + 40 + (H - y - 110 - s.height) // 2
    d.rounded_rectangle((x0 - 2, y0 - 2, x0 + s.width + 1, y0 + s.height + 1), 24, outline=BORDER, width=2)
    im.paste(s, (x0, y0), m)
    return im

def cta(n, total, title, sub, button, foot):
    im, d = frame(n, total)
    y = block(d, (80, 380), title, font('InterDisplay-Black.otf', 92), OFF, 920, 1.04)
    y = block(d, (80, y + 30), sub, font('Inter-Medium.otf', 40), GRAY, 900, 1.3)
    f = font('InterDisplay-Black.otf', 56); tw = d.textlength(button, font=f)
    d.rounded_rectangle((80, y + 70, 80 + tw + 100, y + 70 + 130), 65, fill=LIME)
    d.text((130, y + 70 + 30), button, font=f, fill=CARBON)
    d.text((80, y + 230), foot, font=font('Inter-SemiBold.otf', 36), fill=OFF)
    wordmark(im, 80, H - 230, 64)
    d.text((80, H - 145), 'Software que ya viene listo', font=font('Inter-SemiBold.otf', 32), fill=GRAY)
    return im

AO, MO = 'apple-ops/', 'marketing-ops/'
SIDE = (0.18, 0, 1, 1)  # saca el menú lateral de las capturas de escritorio
MSIDE = (0.165, 0, 1, 1)

IPHONE = [
    lambda n, t: cover(n, t, 'PARA LOCALES DE iPHONE', 'Qué hace Enlata2 en tu local', 'Canje, stock, caja y vidriera online. Todo en un lugar y desde el celular.'),
    lambda n, t: feature(n, t, 'PLAN CANJE', 'El usado se tasa solo', 'Modelo, batería y estado: siempre con la misma regla. Con iCloud activo o IMEI con denuncia, no se toma.', AO + 'etapa-3-venta-con-canje.png', (0.17, 0, 1, 0.62)),
    lambda n, t: feature(n, t, 'STOCK', 'Cada iPhone con su IMEI', 'Condición, batería, origen y cuántos días lleva en stock.', AO + 'etapa-2-stock.png', SIDE),
    lambda n, t: feature(n, t, 'CAJA', 'La diferencia aparece sola', 'Caja por turno con arqueo ciego: el cajero cuenta sin ver cuánto debería haber.', AO + 'etapa-5-caja-cajero.png', SIDE),
    lambda n, t: feature(n, t, 'ROLES', 'Tu vendedor ve el precio. Vos, la ganancia.', 'Cuatro roles, ingreso con PIN y cada venta con nombre y hora.', AO + 'etapa-6-usuarios.png', (0.18, 0, 1, 0.75)),
    lambda n, t: feature(n, t, 'ALERTAS', 'Te avisa antes de que pierdas plata', 'Equipos parados, precios bajo tu margen y el dólar que se actualiza solo.', AO + 'alertas.png', SIDE),
    lambda n, t: feature(n, t, 'CATÁLOGO ONLINE · MÓDULO', 'Tu vidriera, actualizada sola', 'Tu stock publicado, con cotizador de usados y botón a WhatsApp.', AO + 'etapa-7-catalogo.png', (0, 0, 1, 0.42)),
    lambda n, t: cta(n, t, 'Desde $45.900 por mes', 'La base ya trae stock con IMEI, alertas y dólar automático. Los módulos se suman de a uno.', 'Comentá SISTEMA', 'y te lo mostramos con tu stock'),
]

MARKETING = [
    lambda n, t: cover(n, t, 'ENLATA2 MARKETING', 'Tu marketing, sin empezar de cero cada semana', 'Para negocios, emprendimientos y agencias.'),
    lambda n, t: feature(n, t, 'MARCA', 'Cargás tu marca una vez', 'Tono, público y lo que vendés. Todo lo que sale después habla como vos.', MO + 'etapa-1-marca.png', (0.165, 0, 1, 0.42)),
    lambda n, t: feature(n, t, 'GENERAR', 'Posts, Reels, historias y anuncios con tu tono', 'También mensajes de WhatsApp y emails. Nunca inventa precios ni descuentos.', MO + 'etapa-1-generar.png', MSIDE),
    lambda n, t: feature(n, t, 'APROBACIÓN', 'Se aprueba en la app, no por audio', 'El dueño o el cliente aprueba o pide cambios, y queda la versión final.', MO + 'etapa-1-aprobacion.png', MSIDE),
    lambda n, t: feature(n, t, 'CALENDARIO', 'El mes, planificado', 'Cada pieza aprobada con su fecha, lista para publicar.', MO + 'etapa-2-calendario.png', MSIDE),
    lambda n, t: feature(n, t, 'CAMPAÑAS Y MÉTRICAS', 'Brief para Meta Ads y qué funcionó', 'Cargás los resultados y ves qué piezas rindieron y por qué.', MO + 'etapa-4-metricas.png', (0.165, 0, 1, 0.45)),
    lambda n, t: cta(n, t, 'Estamos sumando los primeros negocios', 'Enlata2 Marketing está en lanzamiento.', 'Comentá MARKETING', 'y te contamos cómo probarlo'),
]

CANJE = AO + 'etapa-3-venta-con-canje.png'
USADO = [
    lambda n, t: cover(n, t, 'PLAN CANJE', '3 cosas que mirás antes de tomar un usado', 'Y cómo Enlata2 las convierte en un precio, siempre con la misma regla.'),
    lambda n, t: feature(n, t, '1 · BATERÍA Y ESTADO', 'No vale lo mismo', 'Un 12 con la batería al 84% y marcas leves no vale lo que uno impecable.', CANJE, (0.59, 0.345, 0.977, 0.44)),
    lambda n, t: feature(n, t, '2 · iCLOUD E IMEI', 'Si está bloqueado, no se toma', 'Con Buscar mi iPhone activo o el IMEI con denuncia, el equipo no entra.', CANJE, (0.6, 0.555, 0.965, 0.583)),
    lambda n, t: feature(n, t, '3 · LOS DETALLES', 'Pantalla, cámara, Face ID, carga', 'Cada falla que marcás se descuenta del valor.', CANJE, (0.6, 0.484, 0.965, 0.56)),
    lambda n, t: feature(n, t, 'EL RESULTADO', 'Un precio que no depende de quién atiende', 'Valor de referencia menos estado, batería y defectos. El vendedor no puede pasarse del sugerido.', CANJE, (0.6, 0.62, 0.965, 0.75)),
    lambda n, t: cta(n, t, '¿Tus vendedores tasan todos igual?', 'Con Enlata2, sí.', 'Comentá SISTEMA', 'y tasamos uno de tus equipos en la demo'),
]

APROBACION = [
    lambda n, t: cover(n, t, 'ENLATA2 MARKETING', 'Tu cliente aprueba en la app, no por audio', 'Para agencias y para el dueño que quiere ver todo antes de que salga.'),
    lambda n, t: feature(n, t, '1 · REVISIÓN', 'Mandás la pieza a revisión', 'El revisor la ve tal cual va a salir, con su texto y su red.', MO + 'etapa-1-aprobacion.png', MSIDE),
    lambda n, t: feature(n, t, '2 · APROBAR O PEDIR CAMBIOS', 'El revisor no edita: decide', 'Aprueba, o pide cambios con una nota y la pieza vuelve a borrador.', MO + 'etapa-1-contenidos.png', MSIDE),
    lambda n, t: feature(n, t, '3 · CALENDARIO', 'Lo aprobado queda con su fecha', 'Si alguien lo edita, vuelve a borrador y hay que aprobarlo de nuevo.', MO + 'etapa-2-calendario.png', MSIDE),
    lambda n, t: cta(n, t, 'Chau a "¿cuál era la versión final?"', 'Enlata2 Marketing está en lanzamiento.', 'Comentá MARKETING', 'y te contamos cómo probarlo'),
]

def save_set(name, slides):
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    for i, fn in enumerate(slides, 1):
        fn(i, len(slides)).save(os.path.join(OUT, name, f'{i:02d}.png'))

if __name__ == '__main__':
    save_set('carrusel-iphone', IPHONE)
    save_set('carrusel-marketing', MARKETING)
    save_set('carrusel-usado', USADO)
    save_set('carrusel-aprobacion', APROBACION)
    p = Image.new('RGB', (1080, 1080), CARBON); isotipo(p, 540, 540, 640); p.save(os.path.join(OUT, 'foto-perfil.png'))
    os.makedirs(os.path.join(OUT, 'destacadas'), exist_ok=True)
    for label in ['Demo', 'Canje', 'Caja', 'Precios', 'Marketing', 'Clientes']:
        im = Image.new('RGB', (1080, 1920), CARBON); d = ImageDraw.Draw(im)
        isotipo(im, 540, 860, 300); f = font('InterDisplay-Black.otf', 110)
        d.text(((1080 - d.textlength(label, font=f)) / 2, 1060), label, font=f, fill=OFF)
        im.save(os.path.join(OUT, 'destacadas', f'{label.lower()}.png'))
