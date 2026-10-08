import sys, json, wave
import numpy as np

sfx_json, out_full, out_sfx = sys.argv[1:4]
SR, DUR, BPM = 48000, 33.0, 120
BEAT = 60 / BPM; N = int(SR * DUR)
rng = np.random.default_rng(7)
def t_(d): return np.arange(int(SR * d)) / SR
def env(n, a, r):
    e = np.ones(n); na = max(1, int(SR * a)); e[:na] = np.linspace(0, 1, na)
    return e * np.exp(-np.arange(n) / (SR * r))
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a) * x[i] + a * s; y[i] = s
    return y
def lp_fast(x, fc):   # cheap zero-phase-ish lowpass via FFT for long signals
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / np.sqrt(1 + (f / fc)**4); return np.fft.irfft(X, len(x))
def hp_fast(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); X *= 1 / np.sqrt(1 + (fc / np.maximum(f, 1))**4); return np.fft.irfft(X, len(x))
def place(buf, sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR); j = min(N, i + len(sig))
    if i >= N: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += sig[:j - i] * gain * l * 1.414; buf[1, i:j] += sig[:j - i] * gain * r * 1.414

# ---------- instruments ----------
def kick():
    t = t_(0.35); f = 45 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 9); s += 0.35 * np.tanh(3 * s); s[:60] += rng.normal(0, 0.3, 60) * np.linspace(1, 0, 60); return s
def hat(d=0.04):
    s = hp_fast(rng.normal(0, 1, int(SR * d)), 7000); return s * np.exp(-t_(d) * 90)
def clap():
    d = 0.18; s = lp_fast(hp_fast(rng.normal(0, 1, int(SR * d)), 1200), 6000); e = np.exp(-t_(d) * 22)
    for k in (0.0, 0.012, 0.024): e[int(k * SR):int(k * SR) + 200] += 0.6
    return s * e * 0.6
def tone(freqs, d, harm=6, bright=1.0):
    t = t_(d); s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.12):
            for h in range(1, harm + 1): s += np.sin(2 * np.pi * f * h * (1 + det / 100) * t + h) / h**(1.6 / bright)
    return s / (len(freqs) * 2)
def bass(f, d):
    t = t_(d); s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.25 * np.sin(2 * np.pi * 3 * f * t)
    return np.tanh(1.6 * s) * env(len(t), 0.005, 0.35)
def pluck(f, d=0.22):
    t = t_(d); s = sum(np.sin(2 * np.pi * f * h * t) * np.exp(-t * (14 + 6 * h)) / h for h in range(1, 5)); return s
def bell(f, d=0.6):
    t = t_(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 8)) * np.exp(-t * 6) * env(len(t), 0.002, 10)

CHORDS = [  # (bass root, pad triad, arp notes) one per bar, Am F C G
    (110.0, [220.0, 261.63, 329.63], [440.0, 523.25, 659.25, 523.25]),
    (87.31, [174.61, 220.0, 261.63], [349.23, 440.0, 523.25, 440.0]),
    (130.81, [261.63, 329.63, 392.0], [523.25, 659.25, 783.99, 659.25]),
    (98.0, [196.0, 246.94, 293.66], [392.0, 493.88, 587.33, 493.88])]

music = np.zeros((2, N)); drums = np.zeros((2, N)); duck = np.ones(N)
K, HAT, CLAP = kick(), hat(), clap()
DROP, BREAK, BACK = 5.0, 26.5, 27.0
bars = int(np.ceil(DUR / (4 * BEAT)))
for b in range(bars):
    t0 = b * 4 * BEAT; root, triad, arp = CHORDS[b % 4]
    full = DROP <= t0 < DUR
    p = tone(triad, 4 * BEAT + 0.3, harm=5, bright=0.8) * env(int(SR * (4 * BEAT + 0.3)), 0.25, 6)
    place(music, lp_fast(p, 1800 if t0 >= DROP else 1100), t0, 0.22 if t0 >= DROP else 0.42, 0)
    for k in range(4):
        tb = t0 + k * BEAT
        if tb >= DUR - 0.6: continue
        groove = DROP <= tb and not (BREAK <= tb < BACK)
        if groove:
            place(drums, K, tb, 0.9)
            i = int(tb * SR); duck[i:i + int(0.22 * SR)] = np.minimum(duck[i:i + int(0.22 * SR)], 0.35 + 0.65 * np.linspace(0, 1, int(0.22 * SR))[:N - i])
            place(drums, HAT, tb + BEAT / 2, 0.22, 0.3)
            if k in (1, 3): place(drums, CLAP, tb, 0.35, -0.1)
            place(music, bass(root, BEAT * 0.9), tb, 0.33)
            place(music, bass(root, BEAT * 0.4), tb + BEAT / 2, 0.22)
            for e in (0, 1):
                place(music, pluck(arp[(k * 2 + e) % 4] * 2 if e else arp[(k * 2 + e) % 4]), tb + e * BEAT / 2, 0.10, 0.4 if e else -0.4)
        elif tb < DROP:
            for s in range(4): place(drums, hat(0.02), tb + s * BEAT / 4, 0.07 if s else 0.12, 0.2)
            if tb >= 0.5: place(drums, lp_fast(K, 180), tb, 0.55)
            if tb >= 2.0: place(music, pluck(arp[k % 4], 0.3), tb, 0.06, 0)
music *= duck
# riser into the drop
d = 1.2; t = t_(d); noise = rng.normal(0, 1, len(t))
riser = lp_fast(hp_fast(noise, 2500), 9000) * (t / d)**2 + 0.3 * np.sin(2 * np.pi * (200 + 600 * (t / d)**2) * t) * (t / d)**2
place(music, riser, DROP - d, 0.18)
# fade out tail
fade = np.ones(N); fs = int((DUR - 1.6) * SR); fade[fs:] = np.linspace(1, 0, N - fs)**1.5
music = (music + drums) * fade

# ---------- sound effects ----------
def whoosh(d=0.36):
    t = t_(d); x = rng.normal(0, 1, len(t))
    low = lp_fast(hp_fast(x, 250), 1400); high = lp_fast(hp_fast(x, 1800), 6500)
    e1 = np.sin(np.pi * np.clip(t / (d * 0.8), 0, 1))**2; e2 = np.sin(np.pi * np.clip((t - d * 0.25) / (d * 0.75), 0, 1))**2
    return (low * e1 * 1.2 + high * e2 * 0.5) * 0.9
def swish(): return whoosh(0.2) * 0.8
def pop():
    t = t_(0.06); f = 1300 - 500 * t / 0.06; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 60)
def tick():
    return hp_fast(rng.normal(0, 1, int(SR * 0.012)), 3000) * np.exp(-t_(0.012) * 400)
def click():
    s = np.zeros(int(SR * 0.03)); c = hp_fast(rng.normal(0, 1, 240), 2000) * np.exp(-np.arange(240) / 40)
    s[:240] += c; s[240:480] += 0.6 * c; return s
def confirm():
    s = np.zeros(int(SR * 0.9)); a = bell(1318.5, 0.6); b = bell(1975.5, 0.7)
    s[:len(a)] += a; i = int(0.09 * SR); s[i:i + len(b)] += b[:len(s) - i]; return s * 0.5
def notify():
    s = np.zeros(int(SR * 0.7)); a = bell(1046.5, 0.4); b = bell(1568.0, 0.5)
    s[:len(a)] += a; i = int(0.11 * SR); s[i:i + len(b)] += b[:len(s) - i]; return s * 0.55
def hit():
    t = t_(0.7); f = 38 + 60 * np.exp(-t * 18); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    s[:400] += rng.normal(0, 0.5, 400) * np.linspace(1, 0, 400); return np.tanh(1.5 * s)
def impact():
    t = t_(1.4); s = hit()[:len(t)] if len(hit()) >= len(t) else np.pad(hit(), (0, len(t) - len(hit())))
    tail = lp_fast(rng.normal(0, 1, len(t)), 1500) * np.exp(-t * 3.5) * 0.25; return s + tail
FX = {'whoosh': (whoosh, 0.30), 'swish': (swish, 0.22), 'pop': (pop, 0.16), 'tick': (tick, 0.25), 'click': (click, 0.45),
      'confirm': (confirm, 0.30), 'notify': (notify, 0.32), 'hit': (hit, 0.75), 'impact': (impact, 0.7)}
sfx = np.zeros((2, N))
for i, (tt, kind) in enumerate(json.load(open(sfx_json))):
    fn, g = FX[kind]; pan = (-0.3, 0.3)[i % 2] if kind in ('whoosh', 'swish') else 0
    place(sfx, fn(), tt - (0.12 if kind in ('whoosh', 'swish') else 0), g, pan)

def write(path, x):
    x = x / max(1e-9, np.abs(x).max()) * 0.89
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype('<i2').tobytes())
write(out_full, music * 0.62 + sfx)
write(out_sfx, sfx)
