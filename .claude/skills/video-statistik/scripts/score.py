"""Original score for the WorldStat Atlas guide video (60 s, 96 BPM, D minor -> D major ending)."""
import sys
import numpy as np, scipy.signal as sg
from scipy.io import wavfile
SR = 44100; DUR = 60.0; N = int(SR * DUR)
BEAT = 60 / 96; BAR = 4 * BEAT
rng = np.random.default_rng(3)
L = np.zeros(N); R = np.zeros(N)            # dry bus
VL = np.zeros(N); VR = np.zeros(N)          # reverb send
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def add(sig, t0, gain=1.0, pan=0.0, verb=0.0):
    i = int(t0 * SR); 
    if i >= N: return
    sig = sig[: N - i] * gain
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * gl; R[i:i + len(sig)] += sig * gr
    if verb: VL[i:i + len(sig)] += sig * gl * verb; VR[i:i + len(sig)] += sig * gr * verb
def lp(x, f, o=2): b, a = sg.butter(o, f / (SR / 2), 'low'); return sg.lfilter(b, a, x)
def hp(x, f, o=2): b, a = sg.butter(o, f / (SR / 2), 'high'); return sg.lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = sg.butter(o, [lo / (SR / 2), hi / (SR / 2)], 'band'); return sg.lfilter(b, a, x)
def env(n, a, d):  # attack/decay exponential
    t = np.arange(n) / SR; e = 1 - np.exp(-t / max(a, 1e-4)); return e * np.exp(-t / d)

# ---------- pad (chords per bar, smooth crossfades, filter opening with the edit) ----------
CH = {'Dm9': [50, 57, 60, 64, 65], 'Bb9': [46, 53, 57, 60, 62], 'F9': [41, 53, 57, 60, 64], 'Cs2': [48, 55, 62, 64, 67], 'D9': [50, 57, 62, 66, 76]}
prog = ['Dm9', 'Bb9', 'F9', 'Cs2']
bars = int(np.ceil(DUR / BAR))
t = np.arange(N) / SR
pad = np.zeros(N)
for b in range(bars):
    name = 'D9' if b * BAR >= 55.625 - 0.01 else prog[b % 4]
    t0 = b * BAR if name != 'D9' else 55.625
    t1 = min(DUR, (b + 1) * BAR + 0.8) if name != 'D9' else DUR
    if b * BAR > 55.625: continue
    i0, i1 = int(t0 * SR), int(t1 * SR); n = i1 - i0; tt = np.arange(n) / SR
    seg = np.zeros(n)
    for m in CH[name]:
        f = mtof(m)
        for det in (-0.07, 0, 0.07):
            ph = rng.random()
            seg += (2 * ((tt * f * 2 ** (det / 12) + ph) % 1) - 1) * 0.12
    fade = np.minimum(1, tt / 0.7) * np.minimum(1, (t1 - t0 - tt) / 0.8)
    pad[i0:i1] += seg * fade
cut = np.interp(t, [0, 5, 8.1, 12.5, 16.2, 25, 47, 51.8, 55.6, 60], [0.0, 0.2, 0.35, 0.55, 0.85, 0.75, 0.8, 1.0, 0.6, 0.35])
dark, bright = lp(pad, 700, 2), lp(pad, 3200, 2)
pad = dark * (1 - cut) + bright * cut
padvol = np.interp(t, [0, 0.5, 4.8, 5.0, 8.1, 12.5, 16.0, 16.25, 51.8, 55.4, 55.625, 59, 60], [0, .55, .7, .95, .75, .7, .95, .7, .7, .45, .95, .7, 0])
pad *= padvol * 0.33
add(pad * 0.9, 0, pan=-0.15, verb=0.35); add(pad * 0.9, 0, pan=0.15, verb=0.35)

# ---------- chimes in the cold open + logo shimmer ----------
def bell(f, d=2.2):
    n = int(d * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 3) + 0.2 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt * 6)) * env(n, 0.003, d / 3.5)
for t0, ms in [(0.5, [74, 81]), (1.3, [72]), (2.45, [72, 77]), (3.25, [69]), (5.0, [74, 78, 81, 86]), (23.0, [74, 81, 86])]:
    for j, m in enumerate(ms): add(bell(mtof(m)), t0 + j * 0.03, 0.10, pan=(-0.3 + 0.2 * j), verb=0.9)

# ---------- drums ----------
def kick():
    n = int(0.5 * SR); tt = np.arange(n) / SR
    f = 45 + 95 * np.exp(-tt / 0.03); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt / 0.28) * np.minimum(1, tt / 0.0015) + 0.05 * lp(hp(rng.standard_normal(n), 1500), 6000) * np.exp(-tt / 0.004)
def hat(d=0.045):
    n = int(0.15 * SR); return lp(hp(rng.standard_normal(n), 7000, 2), 12000) * env(n, 0.001, d)
def snap():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    return bp(rng.standard_normal(n), 1200, 5000) * env(n, 0.001, 0.07) + 0.3 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt / 0.05)
K = kick()
duck = np.ones(N)
def kick_at(t0, g=0.9):
    add(K, t0, g)
    i = int(t0 * SR); n = int(0.32 * SR)
    if i < N: d = 1 - 0.55 * np.exp(-np.arange(min(n, N - i)) / SR / 0.11); duck[i:i + len(d)] = np.minimum(duck[i:i + len(d)], d)
beats = np.arange(0, DUR, BEAT)
for bt in beats:
    bi = int(round(bt / BEAT))
    if 8.125 <= bt < 12.5 and bi % 2 == 1: kick_at(bt, 0.7)
    elif 16.25 <= bt < 51.8: kick_at(bt, 0.85)
    if 25.0 <= bt < 51.8 and bi % 2 == 1: add(snap(), bt, 0.08, pan=0.05, verb=0.25)
for e in np.arange(8.125, 51.8, BEAT / 2):
    if 12.5 <= e < 16.25: continue
    if round(e / (BEAT / 2)) % 2 == 1: add(hat(), e, 0.03 if e < 16.25 else 0.05, pan=0.25)
for e in np.arange(46.25, 51.8, BEAT / 4):
    add(hat(0.025), e, 0.022, pan=-0.3)
for j, e in enumerate(np.arange(51.875, 55.625, BEAT / 2)): kick_at(e, 0.45 + 0.4 * j / 12)
for j, e in enumerate(np.arange(54.375, 55.625, BEAT / 4)): add(snap(), e, 0.03 + 0.06 * j / 8, verb=0.3)

# ---------- bass (follows chord roots, side-chained to the kick) ----------
bass = np.zeros(N)
for b in range(bars):
    if b * BAR < 15 or b * BAR >= 55.625: continue
    root = CH[prog[b % 4]][0] - 12
    i0 = int(b * BAR * SR); i1 = min(N, int((b + 1) * BAR * SR)); tt = np.arange(i1 - i0) / SR
    f = mtof(root)
    bass[i0:i1] = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt)) * np.minimum(1, tt / 0.02) * np.minimum(1, ((i1 - i0) / SR - tt) / 0.03) * 4
bass *= ((t >= 16.25) & (t < 55.625)).astype(float)
bass = lp(np.tanh(bass * 0.8), 400) * 0.22
add(bass, 0)

# ---------- arp (plucks on 8ths, ping-pong delay) ----------
def pluck(f, d=0.35):
    n = int(0.6 * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 9) + 0.15 * np.sign(np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 20)
    return lp(s * env(n, 0.002, d / 3), 4000)
arpL = np.zeros(N); arpR = np.zeros(N)
pat = [0, 2, 3, 4, 3, 2, 1, 2]
for e in np.arange(6.25, 55.6, BEAT / 2):
    b = int(e // BAR); notes = CH[prog[b % 4]]
    step = int(round(e / (BEAT / 2)))
    m = notes[pat[step % 8]] + 12 + (12 if (46.25 <= e < 51.8 or 12.5 <= e < 16.25) and step % 4 == 3 else 0)
    g = 0.045 if e < 8.1 else 0.065 if e < 16.25 else 0.075
    p = pluck(mtof(m)); i = int(e * SR); n = min(len(p), N - i)
    arpL[i:i + n] += p[:n] * g; arpR[i:i + n] += p[:n] * g * 0.8
dl = int(BEAT * 0.75 * SR)
dL = np.zeros(N); dR = np.zeros(N)
dR[dl:] += arpL[:-dl] * 0.45; dL[2 * dl:] += arpL[:-2 * dl] * 0.25
L += arpL + dL; R += arpR + dR; VL += (arpL + dL) * 0.4; VR += (arpR + dR) * 0.4

# ---------- transitions, impacts, UI sounds ----------
def whoosh(d=0.9, lo=300, hi=6000):
    n = int(d * SR); tt = np.arange(n) / SR; x = rng.standard_normal(n)
    out = np.zeros(n); K = 8
    for j in range(K):  # band layers crossfaded in time: a smooth filter sweep without per-block clicks
        c = lo * (hi / lo) ** (j / (K - 1)); y = bp(x, max(60, c * 0.7), min(SR / 2.2, c * 1.4), 1)
        w = np.exp(-((tt / d - j / (K - 1)) ** 2) / (2 * 0.12 ** 2)); out += y * w
    out = lp(out, 9000)
    return out / (np.abs(out).max() + 1e-9) * np.sin(np.pi * tt / d) ** 2
def boom(d=2.5):
    n = int(d * SR); tt = np.arange(n) / SR; f = 38 + 50 * np.exp(-tt / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.9) + lp(rng.standard_normal(n), 900) * np.exp(-tt / 0.25) * 0.5
def riser(d):
    n = int(d * SR); tt = np.arange(n) / SR
    return whoosh(d, 200, 9000) * (tt / d) ** 2
def blip(f0=900, f1=1400, d=0.09):
    n = int(d * SR); tt = np.arange(n) / SR; f = np.linspace(f0, f1, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, d / 3)
def tick(f=3200):
    n = int(0.03 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.5 * hp(rng.standard_normal(n), 3000)) * np.exp(-tt / 0.006)
add(riser(1.0), 5.0 - 1.0, 0.10, verb=0.4)
add(boom(), 5.0, 0.5, verb=0.3)
add(riser(1.35), 11.15, 0.13, verb=0.3)
add(boom(), 12.5, 0.55, verb=0.35)
add(riser(1.25), 15.0, 0.12, verb=0.3)
add(boom(1.6), 16.25, 0.3, verb=0.3)
for tc, g in [(8.125, .15), (12.55, .2), (16.25, .24), (25.0, .16), (36.25, .17), (40.6, .14), (42.55, .1), (44.5, .1), (46.2, .14)]:
    w = whoosh(); add(w, tc - 0.55, g, pan=-0.4, verb=0.35); add(w[::-1] * 0.6, tc - 0.45, g, pan=0.4, verb=0.35)
for i in range(6): add(pluck(mtof([74, 76, 77, 79, 81, 86][i]), 0.5), 8.55 + i * 0.12, 0.05, pan=-0.5 + 0.2 * i, verb=0.6)
for tc in [26.55, 28.2]: add(tick(2400), tc, 0.2); add(tick(1600), tc + 0.05, 0.2)
for tc in [26.75, 26.9, 27.05, 27.2]: add(tick(4200 + rng.random() * 600), tc, 0.12, pan=-0.2)
for tc in [29.45, 32.4, 32.9, 35.05, 49.6, 23.25]: add(blip(), tc, 0.13, pan=0.2, verb=0.4)
for i, tc in enumerate([37.0, 37.3]): add(blip(600, 900, 0.14), tc, 0.12, pan=(-0.5, 0.5)[i], verb=0.4)
for i in range(4): add(blip(1200 + 120 * i, 1500 + 120 * i, 0.06), 43.0 + i * 0.09, 0.07, pan=-0.45 + 0.3 * i, verb=0.3)
add(riser(3.75), 51.875, 0.15, verb=0.3)
for tc in [51.875, 53.125, 54.375]: add(boom(0.8), tc, 0.22); add(whoosh(0.35, 2000, 9000), tc - 0.1, 0.12)
add(boom(3.5), 55.625, 0.6, verb=0.4)
for j, m in enumerate([74, 78, 81, 86, 90]): add(bell(mtof(m), 3.2), 55.7 + j * 0.05, 0.09, pan=-0.4 + 0.2 * j, verb=1.0)

# ---------- reverb + master ----------
ir_n = int(2.8 * SR); it = np.arange(ir_n) / SR
irL = lp(rng.standard_normal(ir_n), 5000) * np.exp(-it / 0.55); irR = lp(rng.standard_normal(ir_n), 5000) * np.exp(-it / 0.55)
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
L += sg.fftconvolve(VL, irL)[:N] * 0.9; R += sg.fftconvolve(VR, irR)[:N] * 0.9
L *= np.maximum(duck, 0.6) ** 0.5; R *= np.maximum(duck, 0.6) ** 0.5
fade = np.ones(N); fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
out = np.stack([L, R], 1) * fade[:, None]
out = hp(out.T, 28).T
out = np.tanh(out / np.abs(out).max() * 1.4) / np.tanh(1.4) * 0.89
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'score.wav', SR, (out * 32767).astype(np.int16))
print('peak', np.abs(out).max(), 'rms', np.sqrt((out ** 2).mean()))
