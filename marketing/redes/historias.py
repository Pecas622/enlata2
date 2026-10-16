"""Historias 1080x1920 de la semana de lanzamiento ("Abrimos la lata").

Uso: python3 historias.py <carpeta de salida>
Dejan libre arriba y abajo lo que tapa Instagram, y un hueco donde va el sticker (cuenta regresiva, link,
encuesta o pregunta), que se agrega desde la app al subir la historia.
"""
import os, sys
from PIL import Image, ImageDraw
from piezas import CARBON, LIME, OFF, GRAY, BORDER, font, block, isotipo, wordmark

W, H = 1080, 1920
OUT = sys.argv[1]

def base():
    im = Image.new('RGB', (W, H), CARBON); return im, ImageDraw.Draw(im)

def centered(d, y, text, f, color):
    for line in text.split('\n'):
        d.text(((W - d.textlength(line, font=f)) / 2, y), line, font=f, fill=color); y += int(f.size * 1.05)
    return y

def sticker_hole(d, y, label, h=260):
    """Recuadro punteado que marca dónde poner el sticker; queda tapado por el sticker al subirla."""
    x0, x1 = 140, W - 140
    for x in range(x0, x1, 36): d.line((x, y, min(x + 18, x1), y), fill=BORDER, width=4); d.line((x, y + h, min(x + 18, x1), y + h), fill=BORDER, width=4)
    for yy in range(y, y + h, 36): d.line((x0, yy, x0, min(yy + 18, y + h)), fill=BORDER, width=4); d.line((x1, yy, x1, min(yy + 18, y + h)), fill=BORDER, width=4)
    f = font('Inter-SemiBold.otf', 34); d.text(((W - d.textlength(label, font=f)) / 2, y + h / 2 - 20), label, font=f, fill=GRAY)

def foot(im, d):
    wordmark(im, 0, H - 420, 64, center=True)
    centered(d, H - 335, 'Software que ya viene listo', font('Inter-SemiBold.otf', 32), GRAY)

def teaser1():
    im, d = base(); isotipo(im, W / 2, 700, 520)
    centered(d, 1060, 'Algo se está\npor abrir.', font('InterDisplay-Black.otf', 112), OFF)
    centered(d, 1330, '@enlata2.app', font('Inter-SemiBold.otf', 40), GRAY)
    return im

def teaser2():
    im, d = base(); isotipo(im, W / 2, 520, 300)
    y = centered(d, 760, 'Mañana\nabrimos\nla lata.', font('InterDisplay-Black.otf', 132), OFF)
    sticker_hole(d, y + 60, 'Cuenta regresiva')
    return im

def lanzamiento():
    im, d = base(); isotipo(im, W / 2, 560, 380)
    centered(d, 850, 'ABRIMOS\nLA LATA', font('InterDisplay-Black.otf', 150), LIME)
    block(d, (110, 1200), 'Sistemas que ya vienen listos para tu negocio. Mirá el Reel en el perfil.', font('Inter-Medium.otf', 46), OFF, 860, 1.3)
    foot(im, d)
    return im

def iphone():
    im, d = base()
    d.text((110, 300), 'PARA LOCALES DE IPHONE', font=font('Inter-Bold.otf', 38), fill=LIME)
    y = block(d, (110, 370), 'Canje con tu regla.\nArqueo ciego de caja.\nStock con IMEI.', font('InterDisplay-Black.otf', 84), OFF, 880, 1.08)
    y = block(d, (110, y + 40), 'Te lo mostramos en 20 minutos con tus propios equipos.', font('Inter-Medium.otf', 44), GRAY, 860, 1.3)
    sticker_hole(d, y + 80, 'Link: Pedí una demo', 200)
    foot(im, d)
    return im

def encuesta():
    im, d = base(); isotipo(im, W / 2, 470, 220)
    y = centered(d, 680, '¿Tu local\ntoma usados\nen parte\nde pago?', font('InterDisplay-Black.otf', 110), OFF)
    sticker_hole(d, y + 70, 'Encuesta: Sí / No')
    return im

def marketing():
    im, d = base()
    d.text((110, 300), 'ENLATA2 MARKETING', font=font('Inter-Bold.otf', 38), fill=LIME)
    y = block(d, (110, 370), '¿Otra semana sin saber qué publicar?', font('InterDisplay-Black.otf', 104), OFF, 880, 1.04)
    y = block(d, (110, y + 40), 'Cargás tu marca una vez y sacás posts, Reels y anuncios con tu tono. Probalo gratis.', font('Inter-Medium.otf', 44), GRAY, 860, 1.3)
    sticker_hole(d, y + 80, 'Link: Probalo gratis', 200)
    foot(im, d)
    return im

def pregunta():
    im, d = base(); isotipo(im, W / 2, 470, 220)
    y = centered(d, 680, '¿Qué es lo que\nmás te cuesta\nde tu negocio?', font('InterDisplay-Black.otf', 104), OFF)
    sticker_hole(d, y + 70, 'Caja de preguntas', 320)
    return im

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in [('1-teaser', teaser1), ('2-cuenta-regresiva', teaser2), ('3-abrimos-la-lata', lanzamiento), ('4-iphone', iphone),
                     ('5-encuesta', encuesta), ('6-marketing', marketing), ('7-pregunta', pregunta)]:
        fn().save(os.path.join(OUT, name + '.png'))
