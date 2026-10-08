import sys, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]           # output mp4 (video only)
CTA_MODE = sys.argv[2]      # "organico" | "anuncio"
ONLY = [float(x) for x in sys.argv[3:]]  # optional: times to dump as png instead of video
import os
SRC = os.path.join(os.environ.get('CAPTURAS', '/mnt/project-files/apple-ops'), '')
FONT = '/usr/share/fonts/opentype/inter/'
W, H, FPS = 1080, 1920, 30
BLUE = (41, 151, 255); RED = (255, 99, 82); GREEN = (48, 209, 88); WHITE = (245, 245, 247); SOFT = (174, 174, 178)

def font(name, size): return ImageFont.truetype(FONT + name, size)
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x):
    x = clamp(x); return 4 * x**3 if x < 0.5 else 1 - (-2 * x + 2)**3 / 2
def easeout(x):
    x = clamp(x); return 1 - (1 - x)**3
def lerp(a, b, p): return a + (b - a) * p

# ---------- sources, padded with their page colour so the camera can leave the edges ----------
PAD = 500
def load(name):
    im = Image.open(SRC + name).convert('RGB')
    bg = im.getpixel((im.width - 5, im.height - 5))
    p = Image.new('RGB', (im.width + 2 * PAD, im.height + 2 * PAD), bg); p.paste(im, (PAD, PAD)); return p
IMG = {k: load(v) for k, v in {
    'stock': 'etapa-2-stock.png', 'canje': 'etapa-3-venta-con-canje.png', 'caja': 'etapa-5-caja-cajero.png',
    'roles': 'etapa-6-usuarios.png', 'dash': 'etapa-6-dashboard.png'}.items()}
CHAT = Image.open(SRC + 'etapa-8-chat-canje.png').convert('RGB')

# ---------- background ----------
yy, xx = np.mgrid[0:H, 0:W]
glow = np.exp(-(((xx - W / 2) / 900)**2 + ((yy - 380) / 700)**2))
BG = np.zeros((H, W, 3)); base = np.array([10, 10, 14])
for c in range(3): BG[..., c] = base[c] + glow * [10, 40, 90][c] * 0.55
BG = Image.fromarray(BG.clip(0, 255).astype('uint8'))

# ---------- text ----------
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
        e = text_img(eyebrow, 'Inter-Bold.otf', 38, BLUE); paste_text(fr, e, y, t, delay); y += 66
    paste_text(fr, text_img(head, 'InterDisplay-Black.otf', 96, WHITE), y, t, delay + 0.06)

# ---------- card with a camera ----------
CARD = (65, 660, 950, 742)   # x, y, w, h
def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255); return m
CMASK = rounded_mask(CARD[2], CARD[3], 40)
SHADOW = Image.new('RGBA', (CARD[2] + 160, CARD[3] + 160), (0, 0, 0, 0))
ImageDraw.Draw(SHADOW).rounded_rectangle((80, 100, 80 + CARD[2], 100 + CARD[3]), 40, fill=(0, 0, 0, 170))
SHADOW = SHADOW.filter(ImageFilter.GaussianBlur(36))
def view(cx, cy, w): return (cx, cy, w)
def cam_rect(v):
    cx, cy, w = v; h = w * CARD[3] / CARD[2]; return (cx - w / 2 + PAD, cy - h / 2 + PAD, w, h)
def to_card(r, cam, scale=1.0):
    x0, y0, cw, ch = cam; s = CARD[2] / cw
    return (CARD[0] + (r[0] + PAD - x0) * s, CARD[1] + (r[1] + PAD - y0) * s, CARD[0] + (r[2] + PAD - x0) * s, CARD[1] + (r[3] + PAD - y0) * s)
def draw_card(fr, src, v, punch=1.0, dim=0.0, yoff=0):
    x0, y0, cw, ch = cam_rect(v)
    crop = IMG[src].resize((CARD[2], CARD[3]), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
    if dim: crop = Image.blend(crop, Image.new('RGB', crop.size, (0, 0, 0)), dim)
    fr.alpha_composite(SHADOW, (CARD[0] - 80, CARD[1] - 100 + yoff))
    fr.paste(crop, (CARD[0], CARD[1] + yoff), CMASK)
    return (x0, y0, cw, ch)
CARD_BOX = (CARD[0], CARD[1], CARD[0] + CARD[2], CARD[1] + CARD[3])
def highlight(fr, box, t, color=BLUE, delay=0.0, fill=True, clip=CARD_BOX):
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

# ---------- scenes ----------
SCENES = []   # (start, end, fn)
SFX = []      # (time, kind)
def scene(start, end):
    def wrap(fn): SCENES.append((start, end, fn)); return fn
    return wrap

ACT = IMG['roles'].crop((PAD + 264, PAD + 850, PAD + 1248, PAD + 1340)).resize((1960, 980), Image.BICUBIC).filter(ImageFilter.GaussianBlur(5))
ACT = Image.blend(ACT, Image.new('RGB', ACT.size, (8, 8, 12)), 0.86)
FADE = Image.fromarray((np.clip(np.minimum(np.arange(980), 979 - np.arange(980)) / 260, 0, 1)[:, None] * np.ones((1, W)) * 255).astype('uint8'))
@scene(0.0, 2.0)
def hook(fr, t):
    fr.paste(ACT.crop((440, int(40 + t * 60), 440 + W, int(40 + t * 60) + 980)), (0, 470), FADE)
    l1 = text_img('¿SABÉS QUÉ PASA', 'InterDisplay-Black.otf', 112, WHITE, one=True)
    l2 = text_img('EN TU LOCAL', 'InterDisplay-Black.otf', 112, WHITE, one=True)
    l3 = text_img('CUANDO NO ESTÁS?', 'InterDisplay-Black.otf', 112, BLUE, one=True)
    paste_text(fr, l1, 640, t, 0.0, 0.18); paste_text(fr, l2, 760, t, 0.32, 0.18); paste_text(fr, l3, 880, t, 0.64, 0.18)
SFX += [(0.0, 'hit'), (0.32, 'tick'), (0.64, 'tick')]

def problem(src, v0, v1, box, q):
    def fn(fr, t):
        p = ease(t / 1.0); cx, cy, w = [lerp(a, b, p) for a, b in zip(v0, v1)]
        cam = draw_card(fr, src, (cx, cy, w), dim=0.15)
        highlight(fr, to_card(box, cam), t, RED, 0.25)
        paste_text(fr, text_img(q, 'InterDisplay-Black.otf', 96, WHITE), 340, t, 0.0, 0.16)
    return fn
SCENES.append((2.0, 3.0, problem('canje', (1066, 1150, 640), (1066, 1170, 520), (826, 1200, 1306, 1260), '¿CUÁNTO PAGARON POR ESE USADO?')))
SCENES.append((3.0, 4.0, problem('caja', (756, 700, 1000), (756, 720, 860), (285, 690, 1228, 728), '¿CUADRÓ LA CAJA AYER?')))
SCENES.append((4.0, 5.0, problem('stock', (700, 760, 900), (700, 800, 760), (288, 818, 1000, 862), '¿QUÉ EQUIPO ESTÁ PARADO HACE 52 DÍAS?')))
SFX += [(2.0, 'whoosh'), (2.25, 'pop'), (3.0, 'whoosh'), (3.25, 'pop'), (4.0, 'whoosh'), (4.25, 'pop')]

@scene(5.0, 7.0)
def solution(fr, t):
    d = ImageDraw.Draw(fr); p = easeout(t / 0.35)
    f = font('InterDisplay-Black.otf', int(lerp(210, 176, p)))
    w1 = d.textlength('APPLE', font=f); w2 = d.textlength('OPS', font=f); x = (W - w1 - w2) / 2; y = 430 + (1 - p) * 30
    ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    od.text((x, y), 'APPLE', font=f, fill=WHITE + (int(255 * p),)); od.text((x + w1, y), 'OPS', font=f, fill=BLUE + (int(255 * p),))
    fr.alpha_composite(ov)
    paste_text(fr, text_img('TODO TU LOCAL EN UN SOLO LUGAR', 'Inter-Bold.otf', 54, SOFT, 900), 660, t, 0.35)
    rise = easeout((t - 0.2) / 0.7)
    if rise > 0: draw_card(fr, 'dash', (756, 450, 1250), yoff=int(lerp(700, 180, rise)))
SFX += [(5.0, 'impact')]

def demo(src, eyebrow, steps, hl, dur, cur=None, swap=None):
    """steps: list of (time, view) keyframes; hl: list of (time, box, color); swap: (time, eyebrow, head)"""
    def fn(fr, t):
        v = steps[0][1]
        for (ta, va), (tb, vb) in zip(steps, steps[1:]):
            if t >= ta: v = tuple(lerp(a, b, ease((t - ta) / (tb - ta))) for a, b in zip(va, vb))
        punch = 1 - easeout(t / 0.2)
        cx, cy, w = v; cam = draw_card(fr, src, (cx, cy, w * (1 + 0.06 * punch)))
        for (th, box, col) in hl:
            nxt = [h for h in hl if h[0] > th]
            if t >= th and (not nxt or t < nxt[0][0]): highlight(fr, to_card(box, cam), t, col, th)
        if cur:
            (t0, start, target, tclick) = cur
            if t >= t0:
                tx = to_card(target, cam); tgt = ((tx[0] + tx[2]) / 2, (tx[1] + tx[3]) / 2)
                q = ease((t - t0) / (tclick - t0)); x = lerp(start[0], tgt[0], q); y = lerp(start[1], tgt[1], q)
                cursor(fr, x, y, (t - tclick) / 0.4 if t >= tclick else None)
        if swap and t >= swap[0]: headline(fr, t, swap[1], swap[2], delay=swap[0])
        else: headline(fr, t, eyebrow[0], eyebrow[1])
    return fn

SCENES.append((7.0, 10.0, demo('stock', ('STOCK', 'CADA iPHONE CON SU IMEI'),
    [(0, (800, 450, 1250)), (1.2, (600, 410, 640)), (3.0, (595, 410, 610))], [(1.3, (288, 386, 995, 432), BLUE)], 3.0)))
SFX += [(7.0, 'whoosh'), (8.3, 'pop')]
SCENES.append((10.0, 13.0, demo('canje', ('PLAN CANJE', 'EL USADO SE TASA SOLO'),
    [(0, (1066, 720, 560)), (1.0, (1066, 1130, 520)), (3.0, (1066, 1130, 490))], [(1.2, (826, 1068, 1306, 1188), BLUE)], 3.0)))
SFX += [(10.0, 'whoosh'), (11.2, 'pop')]
SCENES.append((13.0, 15.0, demo('canje', ('COBRO', 'DÓLARES Y PESOS, SIN CALCULADORA'),
    [(0, (1066, 1500, 560)), (2.0, (1066, 1510, 510))], [(0.3, (822, 1408, 1310, 1455), BLUE), (1.3, (826, 1622, 1306, 1666), GREEN)], 2.0,
    cur=(0.5, (900, 1500), (826, 1622, 1306, 1666), 1.25))))
SFX += [(13.0, 'whoosh'), (13.3, 'pop'), (14.25, 'click'), (14.35, 'confirm')]
SCENES.append((15.0, 18.0, demo('caja', ('CAJA', 'EL CAJERO CUENTA A CIEGAS'),
    [(0, (740, 360, 940)), (1.4, (720, 330, 900)), (2.0, (720, 700, 900)), (3.0, (720, 705, 880))],
    [(0.35, (265, 258, 1248, 292), BLUE), (2.0, (285, 690, 1228, 728), RED)], 3.0, swap=(1.8, 'CAJA', 'LA DIFERENCIA APARECE SOLA'))))
SFX += [(15.0, 'whoosh'), (15.35, 'pop'), (16.8, 'swish'), (17.0, 'pop')]
SCENES.append((18.0, 21.0, demo('roles', ('USUARIOS Y ROLES', 'TU VENDEDOR NO VE TUS COSTOS'),
    [(0, (720, 560, 920)), (1.4, (700, 520, 880)), (2.0, (700, 1030, 880)), (3.0, (700, 1035, 860))],
    [(0.35, (285, 418, 1228, 452), BLUE), (2.0, (285, 998, 1228, 1032), BLUE)], 3.0, swap=(1.8, 'ACTIVIDAD', 'CADA VENTA, CON NOMBRE Y HORA'))))
SFX += [(18.0, 'whoosh'), (18.35, 'pop'), (19.8, 'swish'), (20.0, 'pop')]
SCENES.append((21.0, 23.0, demo('dash', ('DASHBOARD', 'TU LOCAL EN TIEMPO REAL'),
    [(0, (756, 450, 1100)), (2.0, (720, 290, 920))], [(0.4, (264, 99, 1248, 189), BLUE)], 2.0)))
SFX += [(21.0, 'whoosh'), (21.4, 'pop')]

PHONE_W, PHONE_H = 470, 1017   # screen 440x952 inside a 15px bezel
PH_X, PH_Y = (W - PHONE_W) // 2, 640
PMASK = rounded_mask(440, 952, 52)
@scene(23.0, 26.5)
def assistant(fr, t):
    if t < 1.9: headline(fr, t, 'CATÁLOGO ONLINE', 'ASISTENTE CON IA')
    else: headline(fr, t, 'CATÁLOGO ONLINE', 'COTIZA EL CANJE SOLO', delay=1.9)
    rise = easeout(t / 0.35); y = PH_Y + int((1 - rise) * 140)
    d = ImageDraw.Draw(fr)
    fr.alpha_composite(SHADOW.resize((PHONE_W + 160, PHONE_H + 160)), (PH_X - 80, y - 60))
    d.rounded_rectangle((PH_X, y, PH_X + PHONE_W, y + PHONE_H), 66, fill=(28, 28, 30), outline=(70, 70, 74), width=3)
    p = ease((t - 0.8) / 2.2); zoom = lerp(1.0, 1.45, p)
    cw, ch = 780 / zoom, 1688 / zoom; cx = lerp(390, 330, p); cy = lerp(844, 1180, p)
    x0 = clamp(cx - cw / 2, 0, 780 - cw); y0 = clamp(cy - ch / 2, 0, 1688 - ch)
    scr = CHAT.resize((440, 952), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
    fr.paste(scr, (PH_X + 15, y + 15), PMASK)
    d.rounded_rectangle((PH_X + 170, y + 26, PH_X + 300, y + 58), 16, fill=(10, 10, 10))
    s = 440 / cw; box = (32, 955, 634, 1403)
    hb = (PH_X + 15 + (box[0] - x0) * s, y + 15 + (box[1] - y0) * s, PH_X + 15 + (box[2] - x0) * s, y + 15 + (box[3] - y0) * s)
    if t > 2.4: highlight(fr, hb, t, BLUE, 2.4, fill=False, clip=(PH_X + 15, y + 15, PH_X + 455, y + 967))
SFX += [(23.0, 'whoosh'), (23.4, 'notify'), (24.9, 'swish'), (25.4, 'pop')]

FLASH = [IMG[k] for k in ('stock', 'caja', 'dash')]
@scene(26.5, 28.5)
def benefit(fr, t):
    k = min(2, int(t / 0.33)) if t < 1.0 else None
    if k is not None:
        im = FLASH[k].crop((PAD + 240, PAD, PAD + 1290, PAD + 900)).resize((W, 924), Image.BICUBIC)
        fr.paste(Image.blend(im, Image.new('RGB', im.size, (8, 8, 12)), 0.78), (0, 500))
    paste_text(fr, text_img('MENOS DESORDEN.', 'InterDisplay-Black.otf', 124, WHITE, one=True), 700, t, 0.0, 0.16)
    paste_text(fr, text_img('MÁS CONTROL.', 'InterDisplay-Black.otf', 124, BLUE, one=True), 840, t, 0.55, 0.16)
SFX += [(26.5, 'hit'), (27.05, 'impact')]

@scene(28.5, 33.0)
def cta(fr, t):
    paste_text(fr, text_img('¿LO QUERÉS EN TU LOCAL?', 'InterDisplay-Black.otf', 92, WHITE), 430, t, 0.0, 0.22)
    label = 'COMENTÁ «SISTEMA»' if CTA_MODE == 'organico' else 'ESCRIBINOS POR WHATSAPP'
    sub = 'y te mostramos cómo funciona con tu stock' if CTA_MODE == 'organico' else 'y te lo mostramos con tu stock'
    p = easeout((t - 0.3) / 0.3)
    if p > 0:
        pulse = 1 + 0.025 * math.sin(max(0, t - 0.9) * 2 * math.pi * 1.0) * (t > 0.9)
        f = font('InterDisplay-Black.otf', 70); d = ImageDraw.Draw(fr)
        while d.textlength(label, font=f) > 820: f = font('InterDisplay-Black.otf', f.size - 4)
        tw = d.textlength(label, font=f); pw, ph = (tw + 120) * pulse * lerp(0.85, 1, p), 150 * pulse * lerp(0.85, 1, p)
        ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov); cy = 770
        od.rounded_rectangle((W / 2 - pw / 2 - 10, cy - ph / 2 - 10, W / 2 + pw / 2 + 10, cy + ph / 2 + 10), 85, fill=BLUE + (int(60 * p),))
        od.rounded_rectangle((W / 2 - pw / 2, cy - ph / 2, W / 2 + pw / 2, cy + ph / 2), 75, fill=(0, 113, 227, int(255 * p)))
        od.text((W / 2 - tw / 2, cy - f.size * 0.62), label, font=f, fill=WHITE + (int(255 * p),))
        fr.alpha_composite(ov)
    paste_text(fr, text_img(sub, 'Inter-SemiBold.otf', 46, SOFT), 900, t, 0.55)
    d = ImageDraw.Draw(fr); f = font('InterDisplay-Black.otf', 64); a = int(255 * easeout((t - 0.8) / 0.3))
    if a > 0:
        w1 = d.textlength('APPLE', font=f); w2 = d.textlength('OPS', font=f); x = (W - w1 - w2) / 2
        ov = Image.new('RGBA', fr.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        od.text((x, 1080), 'APPLE', font=f, fill=WHITE + (a,)); od.text((x + w1, 1080), 'OPS', font=f, fill=BLUE + (a,))
        f2 = font('Inter-SemiBold.otf', 34); s2 = 'by Enlata2'
        od.text(((W - od.textlength(s2, font=f2)) / 2, 1165), s2, font=f2, fill=SOFT + (a,))
        fr.alpha_composite(ov)
SFX += [(28.5, 'whoosh'), (28.8, 'confirm')]
DURATION = 33.0

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
    import json; json.dump(SFX, open(OUT + '.sfx.json', 'w'))
