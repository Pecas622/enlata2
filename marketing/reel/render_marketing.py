"""Reel de Enlata2 Marketing (36 s, 1080x1920) armado con las capturas reales de marketing-ops.

Uso igual que render.py: python3 render_marketing.py salida.mp4 organico|anuncio [tiempos para guardar cuadros sueltos]
El audio sale de audio.py con el .sfx.json que deja este script.
"""
import sys, math, subprocess, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]           # output mp4 (video only)
CTA_MODE = sys.argv[2]      # "organico" | "anuncio"
ONLY = [float(x) for x in sys.argv[3:]]
SRC = os.path.join(os.environ.get('CAPTURAS', '/mnt/project-files/marketing-ops'), '')
FONT = '/usr/share/fonts/opentype/inter/'
W, H, FPS = 1080, 1920, 30
WORD = ('ENLATA', '2'); TAG = 'Marketing'
INDIGO = (94, 92, 230); ACCENT = (184, 255, 61); CARBON = (11, 11, 14); RED = (255, 99, 82); GREEN = (48, 209, 88)
WHITE = (245, 245, 247); SOFT = (174, 174, 178)

def font(name, size): return ImageFont.truetype(FONT + name, size)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x):
    x = clamp(x); return 4 * x**3 if x < 0.5 else 1 - (-2 * x + 2)**3 / 2
def easeout(x):
    x = clamp(x); return 1 - (1 - x)**3
def lerp(a, b, p): return a + (b - a) * p

# ---------- capturas: las coordenadas van en unidades de 1000 = ancho de la captura ----------
PAD = 500
IMG, UNIT = {}, {}
for k, name in {'marca': 'etapa-1-marca.png', 'generar': 'etapa-1-generar.png', 'aprobar': 'etapa-1-aprobacion.png',
                'plan': 'etapa-6-plan.png', 'semana': 'etapa-6b-semana.png', 'metricas': 'etapa-4-metricas.png'}.items():
    im = Image.open(SRC + name).convert('RGB'); bg = im.getpixel((im.width - 5, im.height - 5))
    p = Image.new('RGB', (im.width + 2 * PAD, im.height + 2 * PAD), bg); p.paste(im, (PAD, PAD))
    IMG[k] = p; UNIT[k] = im.width / 1000
PHONE = Image.open(SRC + 'etapa-1-celular.png').convert('RGB')

# ---------- fondo ----------
yy, xx = np.mgrid[0:H, 0:W]
glow = np.exp(-(((xx - W / 2) / 900)**2 + ((yy - 380) / 700)**2))
BG = np.zeros((H, W, 3)); base = np.array([10, 10, 14])
for c in range(3): BG[..., c] = base[c] + glow * [40, 38, 90][c] * 0.55
BG = Image.fromarray(BG.clip(0, 255).astype('uint8'))

# ---------- texto ----------
def fit_lines(text, f, maxw, d):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur); return lines
_cache = {}
def text_img(text, fname, size, color, maxw=950, lh=1.04, one=False):
    key = (text, fname, size, color, maxw, one)
    if key in _cache: return _cache[key]
    d = ImageDraw.Draw(Image.new('L', (1, 1)))
    while True:
        f = font(fname, size); lines = [l for part in text.split('\n') for l in fit_lines(part, f, maxw, d)]
        if (len(lines) == 1 or not one) and all(d.textlength(l, font=f) <= maxw for l in lines) or size < 30: break
        size -= 4
    lhpx = int(size * lh); im = Image.new('RGBA', (W, lhpx * len(lines) + int(size * 0.3)), (0, 0, 0, 0)); dd = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        dd.text(((W - dd.textlength(l, font=f)) / 2, i * lhpx), l, font=f, fill=color)
    _cache[key] = im; return im
def paste_text(fr, im, y, t, delay=0.0, dur=0.28, rise=36):
    p = easeout((t - delay) / dur)
    if p <= 0: return
    a = im.copy(); a.putalpha(a.getchannel('A').point(lambda v: int(v * p)))
    fr.alpha_composite(a, (0, int(y + (1 - p) * rise)))
def headline(fr, t, eyebrow, head, y0=300, delay=0.0):
    y = y0
    if eyebrow:
        paste_text(fr, text_img(eyebrow, 'Inter-Bold.otf', 38, ACCENT), y, t, delay); y += 66
    paste_text(fr, text_img(head, 'InterDisplay-Black.otf', 96, WHITE), y, t, delay + 0.06)
def wordmark(fr, y, size, alpha, tag_size=None):
    d = ImageDraw.Draw(fr); f = font('InterDisplay-Black.otf', size)
    w1 = d.textlength(WORD[0], font=f); w2 = d.textlength(WORD[1], font=f); x = (W - w1 - w2) / 2
    ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    od.text((x, y), WORD[0], font=f, fill=WHITE + (alpha,)); od.text((x + w1, y), WORD[1], font=f, fill=ACCENT + (alpha,))
    if tag_size:
        f2 = font('Inter-SemiBold.otf', tag_size)
        od.text(((W - od.textlength(TAG, font=f2)) / 2, y + size * 1.25), TAG, font=f2, fill=SOFT + (alpha,))
    fr.alpha_composite(ov)

# ---------- tarjeta con cámara ----------
CARD = (65, 660, 950, 742)   # x, y, w, h
def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255); return m
CMASK = rounded_mask(CARD[2], CARD[3], 40)
SHADOW = Image.new('RGBA', (CARD[2] + 160, CARD[3] + 160), (0, 0, 0, 0))
ImageDraw.Draw(SHADOW).rounded_rectangle((80, 100, 80 + CARD[2], 100 + CARD[3]), 40, fill=(0, 0, 0, 170))
SHADOW = SHADOW.filter(ImageFilter.GaussianBlur(36))
CARD_BOX = (CARD[0], CARD[1], CARD[0] + CARD[2], CARD[1] + CARD[3])
def cam_rect(src, v):
    u = UNIT[src]; cx, cy, w = v[0] * u, v[1] * u, v[2] * u; h = w * CARD[3] / CARD[2]
    return (cx - w / 2 + PAD, cy - h / 2 + PAD, w, h)
def to_card(src, r, cam):
    u = UNIT[src]; x0, y0, cw, ch = cam; s = CARD[2] / cw
    return tuple(CARD[i % 2] + (r[i] * u + PAD - (x0, y0)[i % 2]) * s for i in range(4))
def draw_card(fr, src, v, dim=0.0, yoff=0):
    x0, y0, cw, ch = cam_rect(src, v)
    crop = IMG[src].resize((CARD[2], CARD[3]), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
    if dim: crop = Image.blend(crop, Image.new('RGB', crop.size, (0, 0, 0)), dim)
    fr.alpha_composite(SHADOW, (CARD[0] - 80, CARD[1] - 100 + yoff))
    fr.paste(crop, (CARD[0], CARD[1] + yoff), CMASK)
    return (x0, y0, cw, ch)
def highlight(fr, box, t, color=INDIGO, delay=0.0, fill=True, clip=CARD_BOX):
    p = easeout((t - delay) / 0.22)
    if p <= 0: return
    x0, y0, x1, y1 = box; grow = (1 - p) * 26; m = 10
    x0, y0, x1, y1 = x0 - m - grow, y0 - m - grow, x1 + m + grow, y1 + m + grow
    if clip:
        x0, y0 = max(x0, clip[0] + 14), max(y0, clip[1] + 14); x1, y1 = min(x1, clip[2] - 14), min(y1, clip[3] - 14)
        if x1 <= x0 or y1 <= y0: return
    ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov); a = int(255 * p)
    if fill: d.rounded_rectangle((x0, y0, x1, y1), 14, fill=color + (int(38 * p),))
    d.rounded_rectangle((x0 - 6, y0 - 6, x1 + 6, y1 + 6), 18, outline=color + (int(70 * p),), width=8)
    d.rounded_rectangle((x0, y0, x1, y1), 14, outline=color + (a,), width=5)
    fr.alpha_composite(ov)
CURSOR = [(0, 0), (0, 44), (12, 33), (21, 53), (29, 49), (20, 30), (36, 30)]
def cursor(fr, x, y, click_p=None):
    d = ImageDraw.Draw(fr)
    if click_p is not None and 0 <= click_p <= 1:
        r = 14 + 46 * click_p; d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, int(220 * (1 - click_p))), width=5)
    pts = [(x + px * 1.25, y + py * 1.25) for px, py in CURSOR]
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(20, 20, 20, 255)); d.line(pts + [pts[0]], fill=(20, 20, 20, 255), width=3)

# ---------- escenas ----------
SCENES = []   # (inicio, fin, fn)
SFX = []      # (tiempo, tipo)
def scene(start, end):
    def wrap(fn): SCENES.append((start, end, fn)); return fn
    return wrap

WEEK = IMG['semana'].crop((PAD + 200, PAD, PAD + 1280, PAD + 900)).resize((1960, 1633), Image.BICUBIC).filter(ImageFilter.GaussianBlur(5))
WEEK = Image.blend(WEEK, Image.new('RGB', WEEK.size, (8, 8, 12)), 0.86)
FADE = Image.fromarray((np.clip(np.minimum(np.arange(980), 979 - np.arange(980)) / 260, 0, 1)[:, None] * np.ones((1, W)) * 255).astype('uint8'))
@scene(0.0, 2.75)
def hook(fr, t):
    fr.paste(WEEK.crop((440, int(200 + t * 60), 440 + W, int(200 + t * 60) + 980)), (0, 470), FADE)
    paste_text(fr, text_img('¿OTRA SEMANA', 'InterDisplay-Black.otf', 112, WHITE, one=True), 640, t, 0.0, 0.22)
    paste_text(fr, text_img('SIN SABER', 'InterDisplay-Black.otf', 112, WHITE, one=True), 760, t, 0.6, 0.22)
    paste_text(fr, text_img('QUÉ PUBLICAR?', 'InterDisplay-Black.otf', 112, ACCENT, one=True), 880, t, 1.2, 0.22)
SFX += [(0.0, 'hit'), (0.6, 'tick'), (1.2, 'tick')]

def problem(src, v0, v1, q):
    def fn(fr, t):
        p = ease(t / 1.75); draw_card(fr, src, tuple(lerp(a, b, p) for a, b in zip(v0, v1)), dim=0.35)
        paste_text(fr, text_img(q, 'InterDisplay-Black.otf', 96, WHITE), 340, t, 0.0, 0.2)
    return fn
SCENES.append((2.75, 4.5, problem('generar', (590, 530, 820), (590, 540, 700), '¿ESCRIBÍS TODO DE CERO?')))
SCENES.append((4.5, 6.25, problem('aprobar', (760, 420, 560), (760, 440, 480), '¿EL OK TE LLEGA POR AUDIO?')))
SCENES.append((6.25, 8.0, problem('metricas', (590, 160, 820), (590, 170, 700), '¿QUÉ FUNCIONÓ EL MES PASADO?')))
SFX += [(2.75, 'whoosh'), (3.0, 'pop'), (4.5, 'whoosh'), (4.75, 'pop'), (6.25, 'whoosh'), (6.5, 'pop')]

@scene(8.0, 10.0)
def solution(fr, t):
    p = easeout(t / 0.35)
    wordmark(fr, 400 + (1 - p) * 30, int(lerp(210, 176, p)), int(255 * p))
    paste_text(fr, text_img('MARKETING', 'InterDisplay-Black.otf', 80, ACCENT, one=True), 610, t, 0.2)
    paste_text(fr, text_img('TU MARCA, TU TONO, TODO EN UN LUGAR', 'Inter-Bold.otf', 46, SOFT, 900), 720, t, 0.4)
    rise = easeout((t - 0.2) / 0.7)
    if rise > 0: draw_card(fr, 'semana', (590, 290, 820), yoff=int(lerp(700, 200, rise)))
SFX += [(8.0, 'impact')]

def demo(src, eyebrow, steps, hl, cur=None, swap=None):
    """steps: (tiempo, vista); hl: (tiempo, recuadro, color); cur: (t0, inicio en pantalla, recuadro destino, t clic); swap: (tiempo, eyebrow, título)"""
    def fn(fr, t):
        v = steps[0][1]
        for (ta, va), (tb, vb) in zip(steps, steps[1:]):
            if t >= ta: v = tuple(lerp(a, b, ease((t - ta) / (tb - ta))) for a, b in zip(va, vb))
        punch = 1 - easeout(t / 0.2)
        cam = draw_card(fr, src, (v[0], v[1], v[2] * (1 + 0.06 * punch)))
        for (th, box, col) in hl:
            nxt = [h for h in hl if h[0] > th]
            if t >= th and (not nxt or t < nxt[0][0]): highlight(fr, to_card(src, box, cam), t, col, th)
        if cur:
            t0, start, target, tclick = cur
            if t >= t0:
                tx = to_card(src, target, cam); tgt = ((tx[0] + tx[2]) / 2, (tx[1] + tx[3]) / 2)
                q = ease((t - t0) / (tclick - t0))
                cursor(fr, lerp(start[0], tgt[0], q), lerp(start[1], tgt[1], q), (t - tclick) / 0.4 if t >= tclick else None)
        if swap and t >= swap[0]: headline(fr, t, swap[1], swap[2], delay=swap[0])
        else: headline(fr, t, eyebrow[0], eyebrow[1])
    return fn

SCENES.append((10.0, 13.0, demo('marca', ('MARCA', 'CARGÁS TU MARCA UNA VEZ'),
    [(0, (580, 330, 820)), (1.4, (580, 860, 800)), (3.0, (580, 870, 780))],
    [(0.35, (190, 320, 975, 395), INDIGO), (1.6, (190, 760, 975, 1000), INDIGO)], swap=(1.8, 'TONO', 'Y ESCRIBE COMO VOS'))))
SFX += [(10.0, 'whoosh'), (10.35, 'pop'), (11.8, 'swish'), (12.0, 'pop')]
SCENES.append((13.0, 16.0, demo('generar', ('GENERAR', 'POSTS, REELS Y ANUNCIOS'),
    [(0, (580, 220, 820)), (1.2, (580, 220, 820)), (2.0, (330, 530, 520)), (3.0, (330, 540, 500))],
    [(0.2, (195, 148, 525, 212), INDIGO), (2.0, (195, 450, 430, 630), INDIGO)],
    cur=(0.4, (700, 1500), (198, 333, 316, 361), 1.0), swap=(1.8, 'GENERAR', '3 VERSIONES PARA ELEGIR'))))
SFX += [(13.0, 'whoosh'), (13.2, 'pop'), (14.0, 'click'), (14.1, 'confirm'), (14.8, 'swish'), (15.0, 'pop')]
SCENES.append((16.0, 18.5, demo('aprobar', ('APROBACIÓN', 'SIN AUDIOS NI CAPTURAS'),
    [(0, (760, 330, 560)), (2.5, (760, 320, 500))],
    [(0.3, (600, 240, 852, 670), INDIGO), (1.4, (600, 150, 664, 176), GREEN)],
    cur=(0.6, (900, 1450), (600, 150, 664, 176), 1.25))))
SFX += [(16.0, 'whoosh'), (16.3, 'pop'), (17.25, 'click'), (17.35, 'confirm')]
SCENES.append((18.5, 21.5, demo('plan', ('PLAN DEL MES', 'EL MES, ARMADO'),
    [(0, (590, 520, 820)), (1.4, (590, 560, 800)), (3.0, (590, 900, 800))],
    [(0.35, (206, 455, 975, 548), INDIGO), (1.9, (206, 842, 975, 935), INDIGO)], swap=(1.8, 'PLAN DEL MES', 'CADA PIEZA CON SU PORQUÉ'))))
SFX += [(18.5, 'whoosh'), (18.85, 'pop'), (20.3, 'swish'), (20.4, 'pop')]
SCENES.append((21.5, 24.0, demo('semana', ('CALENDARIO', 'CADA PIEZA CON SU FECHA'),
    [(0, (590, 260, 820)), (1.2, (590, 260, 800)), (2.5, (790, 510, 520))],
    [(0.35, (206, 172, 975, 305), INDIGO), (1.6, (600, 455, 975, 572), INDIGO)], swap=(1.4, 'CALENDARIO', 'SABÉS QUÉ FALTA APROBAR'))))
SFX += [(21.5, 'whoosh'), (21.85, 'pop'), (22.9, 'swish'), (23.1, 'pop')]
SCENES.append((24.0, 27.0, demo('metricas', ('MÉTRICAS', 'QUÉ FUNCIONÓ'),
    [(0, (590, 160, 820)), (1.2, (590, 160, 800)), (2.0, (390, 430, 520)), (3.0, (390, 440, 500))],
    [(0.35, (195, 110, 975, 190), INDIGO), (2.0, (210, 330, 565, 420), GREEN)], swap=(1.8, 'MÉTRICAS', 'Y QUÉ REPETIR'))))
SFX += [(24.0, 'whoosh'), (24.35, 'pop'), (25.8, 'swish'), (26.0, 'pop')]

PHONE_W, PHONE_H = 470, 1017   # pantalla 440x952 dentro de un borde de 15px
PH_X, PH_Y = (W - PHONE_W) // 2, 640
PMASK = rounded_mask(440, 952, 52)
@scene(27.0, 29.5)
def phone(fr, t):
    headline(fr, t, 'DESDE EL CELULAR', 'GUIONES LISTOS PARA GRABAR')
    rise = easeout(t / 0.35); y = PH_Y + int((1 - rise) * 140)
    d = ImageDraw.Draw(fr)
    fr.alpha_composite(SHADOW.resize((PHONE_W + 160, PHONE_H + 160)), (PH_X - 80, y - 60))
    d.rounded_rectangle((PH_X, y, PH_X + PHONE_W, y + PHONE_H), 66, fill=(28, 28, 30), outline=(70, 70, 74), width=3)
    p = ease((t - 0.6) / 1.8); zoom = lerp(1.0, 1.3, p)
    cw, ch = 780 / zoom, 1688 / zoom; cx = lerp(390, 300, p); cy = lerp(844, 900, p)
    x0 = clamp(cx - cw / 2, 0, 780 - cw); y0 = clamp(cy - ch / 2, 0, 1688 - ch)
    fr.paste(PHONE.resize((440, 952), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch)), (PH_X + 15, y + 15), PMASK)
    d.rounded_rectangle((PH_X + 170, y + 26, PH_X + 300, y + 58), 16, fill=(10, 10, 10))
    s = 440 / cw; box = (76, 680, 704, 1196)
    hb = (PH_X + 15 + (box[0] - x0) * s, y + 15 + (box[1] - y0) * s, PH_X + 15 + (box[2] - x0) * s, y + 15 + (box[3] - y0) * s)
    if t > 1.4: highlight(fr, hb, t, INDIGO, 1.4, fill=False, clip=(PH_X + 15, y + 15, PH_X + 455, y + 967))
SFX += [(27.0, 'whoosh'), (27.4, 'notify'), (28.4, 'pop')]

FLASH = ['generar', 'semana', 'metricas']
@scene(29.5, 31.5)
def benefit(fr, t):
    k = min(2, int(t / 0.33)) if t < 1.0 else None
    if k is not None:
        src = IMG[FLASH[k]]; u = UNIT[FLASH[k]]
        im = src.crop((PAD + int(170 * u), PAD, PAD + int(1000 * u), PAD + int(830 * u * 924 / W))).resize((W, 924), Image.BICUBIC)
        fr.paste(Image.blend(im, Image.new('RGB', im.size, (8, 8, 12)), 0.78), (0, 500))
    paste_text(fr, text_img('MENOS IMPROVISAR.', 'InterDisplay-Black.otf', 124, WHITE, one=True), 700, t, 0.0, 0.16)
    paste_text(fr, text_img('MÁS CONSTANCIA.', 'InterDisplay-Black.otf', 124, ACCENT, one=True), 840, t, 0.55, 0.16)
SFX += [(29.5, 'hit'), (30.05, 'impact')]

@scene(31.5, 36)
def cta(fr, t):
    paste_text(fr, text_img('¿LO QUERÉS PARA TU NEGOCIO?', 'InterDisplay-Black.otf', 92, WHITE), 400, t, 0.0, 0.22)
    label = 'COMENTÁ «MARKETING»' if CTA_MODE == 'organico' else 'ESCRIBINOS POR WHATSAPP'
    p = easeout((t - 0.3) / 0.3)
    if p > 0:
        pulse = 1 + 0.025 * math.sin(max(0, t - 0.9) * 2 * math.pi * 1.0) * (t > 0.9)
        f = font('InterDisplay-Black.otf', 70); d = ImageDraw.Draw(fr)
        while d.textlength(label, font=f) > 820: f = font('InterDisplay-Black.otf', f.size - 4)
        tw = d.textlength(label, font=f); pw, ph = (tw + 120) * pulse * lerp(0.85, 1, p), 150 * pulse * lerp(0.85, 1, p)
        ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov); cy = 770
        od.rounded_rectangle((W / 2 - pw / 2 - 10, cy - ph / 2 - 10, W / 2 + pw / 2 + 10, cy + ph / 2 + 10), 85, fill=ACCENT + (int(60 * p),))
        od.rounded_rectangle((W / 2 - pw / 2, cy - ph / 2, W / 2 + pw / 2, cy + ph / 2), 75, fill=ACCENT + (int(255 * p),))
        od.text((W / 2 - tw / 2, cy - f.size * 0.62), label, font=f, fill=CARBON + (int(255 * p),))
        fr.alpha_composite(ov)
    paste_text(fr, text_img('y te contamos cómo probarlo', 'Inter-SemiBold.otf', 46, SOFT), 900, t, 0.55)
    a = int(255 * easeout((t - 0.8) / 0.3))
    if a > 0: wordmark(fr, 1080, 64, a, tag_size=34)
SFX += [(31.5, 'whoosh'), (31.8, 'confirm')]
DURATION = 36.0

def frame_at(t):
    fr = BG.convert('RGBA')
    for s, e, fn in SCENES:
        if s <= t < e: fn(fr, t - s); break
    return fr.convert('RGB')

if __name__ == '__main__':
    if ONLY:
        for t in ONLY: frame_at(t).save(f'{OUT}_{t:05.2f}.png')
        sys.exit()
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', OUT], stdin=subprocess.PIPE)
    for i in range(int(DURATION * FPS)):
        ff.stdin.write(frame_at(i / FPS).tobytes())
    ff.stdin.close(); ff.wait()
    json.dump({'sfx': SFX, 'dur': DURATION, 'drop': 8.0, 'break': [29.5, 30.0]}, open(OUT + '.sfx.json', 'w'))   # audio.py arma la música sobre estos tiempos
