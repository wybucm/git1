#!/usr/bin/env python3
"""全部用代码合成的配乐与音效（无任何采样/版权素材）。

读取 render.mjs 导出的 out/cues.json（导演页在真实交互发生的那一帧写入的提示点），
把 UI 音效精确放到对应时间；配乐按 120 BPM 的固定段落结构生成，与剪辑点对齐。

用法：python3 audio.py [out/cues.json] [out/audio.wav]
"""
import json
import sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(20260927)

cues_path = sys.argv[1] if len(sys.argv) > 1 else 'out/cues.json'
out_path = sys.argv[2] if len(sys.argv) > 2 else 'out/audio.wav'
meta = json.load(open(cues_path))
DUR = meta['duration']
N = int(DUR * SR)
CUES = meta['cues']

# 三条总线：音乐、音效、送混响
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
verb_send = np.zeros((N, 2))


# ---------------------------------------------------------------- 基础工具
def t_arr(dur):
    return np.arange(int(dur * SR)) / SR


def place(bus, x, t, gain=1.0, pan=0.0, send=0.0):
    """把单声道/立体声片段放到总线的 t 秒处。pan: -1 左 … 1 右"""
    i = int(round(t * SR))
    if i >= N or len(x) == 0:
        return
    if i < 0:
        x = x[-i:]
        i = 0
    x = x[: N - i]
    if x.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        st = np.stack([x * l, x * r], axis=1) * 1.414
    else:
        st = x
    bus[i : i + len(st)] += st * gain
    if send:
        verb_send[i : i + len(st)] += st * gain * send


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def adsr(n, a=0.01, r=0.1):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def lp(x, f, order=2):
    b, a = signal.butter(order, min(f, SR / 2 - 100) / (SR / 2), 'low')
    return signal.lfilter(b, a, x, axis=0)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'high')
    return signal.lfilter(b, a, x, axis=0)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, f0, f1, q=4.0, kind='bp'):
    """时变状态变量滤波器（逐样本），用于嗖声/上升音效"""
    n = len(x)
    fc = np.geomspace(max(f0, 20), max(f1, 20), n)
    g = np.tan(np.pi * np.minimum(fc, SR * 0.45) / SR)
    k = 1 / q
    ic1 = ic2 = 0.0
    y = np.empty(n)
    for i in range(n):
        gi = g[i]
        a1 = 1 / (1 + gi * (gi + k))
        v3 = x[i] - ic2
        v1 = a1 * ic1 + gi * a1 * v3
        v2 = ic2 + gi * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[i] = v1 * k if kind == 'bp' else v2
    return y


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def noise_n(n):
    return rng.standard_normal(n)


def saw(freq, dur, detune=0.0, phase=None):
    t = t_arr(dur)
    ph = rng.random() if phase is None else phase
    return 2 * ((t * freq * (1 + detune) + ph) % 1) - 1


def note_hz(n):  # MIDI → Hz
    return 440 * 2 ** ((n - 69) / 12)


# ---------------------------------------------------------------- 乐器
def kick(v=1.0, dur=0.55, f0=150, f1=42):
    t = t_arr(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(len(t), 0.22)
    click = hp(noise(0.006), 2000) * 0.5
    body[: len(click)] += click
    return np.tanh(body * 1.6) * v


def snare(v=1.0):
    d = 0.32
    n = bp(noise(d), 900, 7000) * env_exp(int(d * SR), 0.07)
    t = t_arr(d)
    tone = np.sin(2 * np.pi * 190 * t) * env_exp(len(t), 0.05) * 0.6
    return (n + tone) * v * 0.8


def clap(v=1.0):
    d = 0.3
    x = bp(noise(d), 1000, 5000)
    e = np.zeros(len(x))
    for o in (0, 0.011, 0.022):
        i = int(o * SR)
        e[i:] += env_exp(len(x) - i, 0.012 if o < 0.02 else 0.09)
    return x * e * v * 0.7


def hat(v=1.0, open_=False):
    d = 0.25 if open_ else 0.06
    return hp(noise(d), 7000) * env_exp(int(d * SR), 0.08 if open_ else 0.018) * v * 0.35


def tom(v=1.0, f0=110, f1=70, dur=0.9):
    t = t_arr(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.28)
    skin = lp(noise(dur), 1200) * env_exp(len(t), 0.03) * 0.8
    return np.tanh((body + skin) * 1.4) * v


def boom(v=1.0, dur=3.2, f0=62, f1=28):
    """低频冲击（sub drop）"""
    t = t_arr(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.4)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.9)
    s = np.tanh(s * 2.2) * 0.9
    crack = lp(noise(dur), 3500) * env_exp(len(t), 0.12) * 0.5
    return (s + crack) * v


def braam(root_midi, dur=2.6, v=1.0):
    """预告片式铜管“嗡——”：多个失谐锯齿 + 打开的低通"""
    t = t_arr(dur)
    x = np.zeros(len(t))
    for m in (root_midi, root_midi + 12, root_midi + 7 + 12):
        for d in (-0.006, 0, 0.007):
            x += saw(note_hz(m), dur, d)
    cutoff = 200 + 1600 * np.exp(-t / 0.5)
    # 分块近似时变低通
    y = np.zeros_like(x)
    blk = 2048
    zi = None
    for i in range(0, len(x), blk):
        fc = float(cutoff[i])
        b, a = signal.butter(2, fc / (SR / 2), 'low')
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        y[i : i + blk], zi = signal.lfilter(b, a, x[i : i + blk], zi=zi)
    y = np.tanh(y * 0.5) * adsr(len(t), 0.02, 1.2)
    return y * v * 0.5


def pad(midis, dur, v=1.0, bright=900, attack=1.0, release=1.5):
    t = t_arr(dur)
    L = np.zeros(len(t))
    R = np.zeros(len(t))
    for m in midis:
        f = note_hz(m)
        for j, d in enumerate((-0.004, -0.0015, 0.0015, 0.004)):
            s = saw(f, dur, d)
            (L if j % 2 == 0 else R)[:] += s
    L, R = lp(L, bright), lp(R, bright)
    e = adsr(len(t), attack, release)
    wob = 1 + 0.08 * np.sin(2 * np.pi * 0.2 * t)
    return np.stack([L * e * wob, R * e * wob], axis=1) * v * 0.06


def pluck(midi, v=1.0, dur=0.35, bright=4000):
    t = t_arr(dur)
    f = note_hz(midi)
    x = saw(f, dur, 0) * 0.6 + saw(f, dur, 0.004) * 0.4
    x = lp(x, bright) * env_exp(len(t), 0.09)
    return x * v * 0.35


def bass(midi, dur, v=1.0):
    t = t_arr(dur)
    f = note_hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.35 * saw(f, dur) * 0.6
    x = lp(x, 500) * adsr(len(t), 0.004, 0.05) * env_exp(len(t), 0.25)
    return np.tanh(x * 1.5) * v * 0.55


def bell(freq, v=1.0, dur=1.6):
    """FM 钟声"""
    t = t_arr(dur)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 2.2 * env_exp(len(t), 0.3)
    x = np.sin(2 * np.pi * freq * t + mod) * env_exp(len(t), 0.55)
    return x * v * 0.25


def whoosh(dur=0.8, v=1.0, f0=300, f1=3500, rev=False):
    n = noise(dur)
    y = sweep_filter(n, f0, f1, q=2.5)
    e = np.sin(np.linspace(0, np.pi, len(y))) ** 1.6
    y = y * e
    if rev:
        y = y[::-1]
    return y * v * 0.6


def riser(dur=1.0, v=1.0):
    t = t_arr(dur)
    y = sweep_filter(noise(dur), 200, 9000, q=5) * 0.7
    f = np.geomspace(120, 1400, len(t))
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    e = (t / dur) ** 2.2
    return y * e * v


def tapestop(dur=0.7, v=1.0, up=False):
    t = t_arr(dur)
    f = np.geomspace(900, 40, len(t)) if not up else np.geomspace(40, 900, len(t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    x += sweep_filter(noise(dur), 4000, 200, q=3) * 0.5 if not up else sweep_filter(noise(dur), 200, 4000, q=3) * 0.5
    e = np.sin(np.linspace(0, np.pi, len(t))) ** 1.2
    return x * e * v


# ---------------------------------------------------------------- UI 音效
def ui_key(v=1.0):
    d = 0.05
    x = bp(noise(d), 1800, 9000) * env_exp(int(d * SR), 0.004)
    t = t_arr(d)
    x += np.sin(2 * np.pi * (2400 + rng.random() * 600) * t) * env_exp(len(t), 0.003) * 0.3
    thock = lp(noise(d), 600) * env_exp(len(t), 0.008) * 0.8
    return (x + thock) * v * 0.55


def ui_enter():
    d = 0.12
    t = t_arr(d)
    x = lp(noise(d), 900) * env_exp(len(t), 0.015) * 1.2
    x += np.sin(2 * np.pi * 160 * t) * env_exp(len(t), 0.03) * 0.7
    return x * 0.7


def ui_tick(v=1.0):
    d = 0.06
    t = t_arr(d)
    return np.sin(2 * np.pi * 3200 * t) * env_exp(len(t), 0.006) * v * 0.25


def ui_click(v=1.0):
    d = 0.09
    t = t_arr(d)
    a = bp(noise(d), 2500, 12000) * env_exp(len(t), 0.0025)
    b = np.zeros(len(t))
    i = int(0.045 * SR)
    b[i:] = bp(noise_n(len(t) - i), 2000, 9000) * env_exp(len(t) - i, 0.002) * 0.6
    body = np.sin(2 * np.pi * 1300 * t) * env_exp(len(t), 0.004) * 0.3
    return (a + b + body) * v * 0.6


def ui_drop(v=1.0):
    """落位的“咔哒”：木质短促的两声 + 低频托底"""
    d = 0.35
    t = t_arr(d)
    ka = bp(noise(d), 1500, 6000) * env_exp(len(t), 0.004) * 1.1
    ka += np.sin(2 * np.pi * 1850 * t) * env_exp(len(t), 0.012) * 0.5
    da = np.zeros(len(t))
    i = int(0.028 * SR)
    da[i:] = (bp(noise_n(len(t) - i), 500, 2500) * env_exp(len(t) - i, 0.01) * 0.9 +
              np.sin(2 * np.pi * 620 * t[: len(t) - i]) * env_exp(len(t) - i, 0.03) * 0.5)
    thump = np.sin(2 * np.pi * 70 * t) * env_exp(len(t), 0.09) * 0.8
    return np.tanh((ka + da + thump) * 1.2) * v * 0.8


def ui_pop(v=1.0):
    d = 0.18
    t = t_arr(d)
    f = np.geomspace(500, 1300, len(t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.04) * v * 0.3


def ui_lift(dur=0.6, v=1.0):
    n = noise(dur)
    y = sweep_filter(n, 250, 2600, q=3)
    e = np.sin(np.linspace(0, np.pi, len(y))) ** 2
    return y * e * v * 0.5


def ui_flip(dur=0.25, v=1.0):
    n = noise(dur)
    y = sweep_filter(n, 2500, 500, q=2)
    e = np.sin(np.linspace(0, np.pi, len(y))) ** 1.5
    return y * e * v * 0.35


# ---------------------------------------------------------------- 配乐
A2 = 45  # MIDI
CHORDS = {  # 根音 + 和弦音（A 小调）
    'Am': (45, [57, 60, 64]), 'F': (41, [57, 60, 65]), 'C': (48, [55, 60, 64]),
    'G': (43, [55, 59, 62]), 'E': (40, [56, 59, 64]), 'Dm': (38, [57, 62, 65]),
}


def beats(a, b, step=BEAT, offset=0.0):
    t = a + offset
    while t < b - 1e-6:
        yield t
        t += step


# 0–5：开场氛围
place(music, pad([45, 52, 57, 60], 5.3, v=1.5, bright=800, attack=1.2, release=0.8), 0.0, send=0.5)
place(music, pad([69, 76], 5.0, v=0.35, bright=2500, attack=2.5, release=0.5), 0.2, send=0.6)

# 5–8.2：冲击 + 嗡声 + 低音驱动
place(music, braam(33, 3.0, 1.0), 5.0, send=0.3)
place(music, pad([45, 52, 57, 64], 5.2, v=0.9, bright=1200, attack=0.05, release=1.6), 5.0, send=0.5)
for t in beats(5.0, 8.0, BEAT / 2):
    place(music, bass(33, BEAT / 2 * 0.9, 0.55 + 0.15 * ((t - 5) / 3)), t)
place(music, braam(29, 2.0, 0.8), 6.55, send=0.3)  # F
for t in beats(7.0, 8.0, BEAT / 4):
    place(music, tom(0.25 + 0.5 * (t - 7), 130, 90, 0.4), t, pan=0.3 * np.sin(t * 9), send=0.2)

# 8–10.3：鼓点进场（预告片式战鼓）
for i, t in enumerate(beats(8.0, 10.3)):
    place(music, kick(0.95), t)
    place(music, tom(0.55, 100, 65), t + BEAT / 2, pan=-0.3, send=0.25)
    if i % 2:
        place(music, snare(0.6), t, send=0.3)
for t in beats(8.0, 10.3, BEAT / 4):
    place(music, hat(0.5), t, pan=0.4)
for i, t in enumerate(beats(8.0, 10.3, BEAT / 4)):
    place(music, pluck([57, 60, 64, 69][i % 4] + 12, 0.8), t, pan=-0.25 if i % 2 else 0.25, send=0.3)
place(music, pad([45, 52, 60, 64], 2.6, v=0.7, bright=1500, attack=0.3), 8.0, send=0.4)

# 10.3–12.15：慢镜头 · 拿起（鼓点抽离，心跳 + 高音弦乐）
place(music, pad([57, 64, 69, 72, 76], 6.8, v=0.55, bright=2600, attack=0.6, release=1.0), 10.35, send=0.8)
for t in (10.6, 11.35, 12.0):
    place(music, kick(0.55, 0.8, 80, 35), t, send=0.2)
    place(music, kick(0.3, 0.6, 70, 32), t + 0.22)
# 12.15–13.3：甩镜，战鼓过门
for i, t in enumerate(beats(12.2, 13.3, BEAT / 4)):
    place(music, tom(0.35 + i * 0.05, 140 - i * 4, 80, 0.45), t, pan=-0.5 + i / 8, send=0.25)
place(music, kick(1.0), 12.2)
# 13.3–16.9：慢镜头 · 让位（悬停感）
place(music, pad([53, 60, 65, 69, 72], 3.8, v=0.6, bright=2200, attack=0.3, release=1.2), 13.3, send=0.8)
for t in (13.45, 14.35, 15.25, 16.15):
    place(music, kick(0.5, 0.8, 80, 35), t, send=0.2)
    place(music, kick(0.25, 0.6, 70, 32), t + 0.22)
# 16.3 落定 → 音乐重新落地
place(music, pad([45, 52, 57, 60, 64], 2.4, v=0.8, bright=1600, attack=0.02, release=1.2), 16.3, send=0.6)

# 16.9–18.3：回到常速
for i, t in enumerate(beats(16.9, 18.3)):
    place(music, kick(0.8), t)
    place(music, hat(0.4), t + BEAT / 2, pan=0.3)
for t in beats(16.9, 18.3, BEAT / 2):
    place(music, bass(33, BEAT / 2 * 0.9, 0.55), t)

# 18.3–23：列表拖拽（半速律动 + 宽广铺底）
place(music, pad([41, 48, 57, 60, 64], 2.4, v=0.8, bright=1300, attack=0.3, release=0.8), 18.3, send=0.6)
place(music, pad([43, 50, 55, 59, 62], 2.5, v=0.8, bright=1300, attack=0.3, release=1.2), 20.6, send=0.6)
for i, t in enumerate(beats(18.3, 23.0, BEAT * 2)):
    place(music, kick(0.85), t)
    place(music, clap(0.5), t + BEAT, send=0.5)
for i, t in enumerate(beats(18.3, 23.0, BEAT / 2)):
    place(music, pluck([69, 72, 76, 72][i % 4], 0.5, 0.6, 2500), t, pan=0.3 if i % 2 else -0.3, send=0.5)
place(music, riser(0.9, 0.5), 22.1)

# 23–40：功能蒙太奇（完整律动，Am–F–C–G）
prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'E']
for bi, name in enumerate(prog):
    b0 = 23.0 + bi * 2 * BEAT * 2
    root, notes = CHORDS[name]
    b1 = min(b0 + 4 * BEAT, 40.0)
    place(music, pad([root + 12] + notes, b1 - b0 + 0.3, v=0.55, bright=1400, attack=0.05, release=0.3), b0, send=0.4)
    for i, t in enumerate(beats(b0, b1, BEAT / 2)):
        place(music, bass(root - 12 + (12 if i % 2 else 0), BEAT / 2 * 0.85, 0.7), t)
    arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 12]
    for i, t in enumerate(beats(b0, b1, BEAT / 4)):
        place(music, pluck(arp[i % 4], 0.45, 0.25, 3000), t, pan=-0.35 if i % 2 else 0.35, send=0.3)
for i, t in enumerate(beats(23.0, 40.0)):
    place(music, kick(0.9), t)
    if i % 2:
        place(music, snare(0.55), t, send=0.25)
        place(music, clap(0.35), t, send=0.3)
for i, t in enumerate(beats(23.0, 40.0, BEAT / 4)):
    place(music, hat(0.35 if i % 2 else 0.55), t, pan=0.35)

# 40–45：高潮（加入战鼓与更高的琶音）
place(music, braam(33, 2.2, 0.7), 40.0, send=0.3)
for bi, name in enumerate(['Am', 'F', 'Dm', 'E']):
    b0 = 40.0 + bi * 1.25
    root, notes = CHORDS[name]
    place(music, pad([root + 12] + notes + [notes[0] + 12], 1.35, v=0.6, bright=2200, attack=0.02, release=0.2), b0, send=0.4)
    for i, t in enumerate(beats(b0, b0 + 1.25, BEAT / 2)):
        place(music, bass(root - 12, BEAT / 2 * 0.85, 0.75), t)
    for i, t in enumerate(beats(b0, b0 + 1.25, BEAT / 4)):
        place(music, pluck([notes[0] + 24, notes[2] + 12, notes[1] + 12, notes[2] + 12][i % 4], 0.45, 0.2, 4500), t, pan=0.4 * np.sin(i), send=0.3)
for i, t in enumerate(beats(40.0, 45.0)):
    place(music, kick(1.0), t)
    place(music, tom(0.5, 110, 70), t + BEAT / 2, pan=-0.3, send=0.3)
    if i % 2:
        place(music, snare(0.7), t, send=0.3)
for t in beats(40.0, 45.0, BEAT / 4):
    place(music, hat(0.5), t, pan=0.3)

# 46–51：数据段（冲击 + 低频脉冲）
place(music, pad([45, 52, 57, 60, 64, 71], 5.2, v=0.7, bright=1800, attack=0.05, release=1.5), 46.0, send=0.7)
for t in beats(46.0, 51.0, BEAT / 2):
    place(music, bass(33, BEAT / 2 * 0.8, 0.45), t)
for t in beats(46.0, 51.0, BEAT):
    place(music, kick(0.6, 0.6, 90, 38), t)

# 51–55：标语（开阔的大和弦：F → C/E → Am）
place(music, braam(29, 2.4, 0.6), 51.0, send=0.4)
place(music, pad([41, 53, 57, 60, 65, 69, 72], 2.2, v=0.85, bright=2600, attack=0.05, release=0.6), 51.0, send=0.8)
place(music, pad([40, 52, 55, 60, 64, 67, 72], 2.4, v=0.8, bright=2400, attack=0.4, release=1.4), 53.0, send=0.8)
for t in (51.0, 52.0, 53.0, 54.0):
    place(music, tom(0.6, 90, 55, 1.2), t, send=0.5)

# 55–58：结尾（低频余韵 + 钢琴般的单音）
place(music, pad([45, 57, 64, 69], 3.2, v=0.55, bright=900, attack=0.02, release=2.6), 55.0, send=0.9)
place(music, bell(note_hz(81), 0.7, 3.0), 55.05, send=0.9)
place(music, bell(note_hz(76), 0.4, 2.8), 55.55, pan=0.3, send=0.9)


# ---------------------------------------------------------------- UI 音效按提示点放置
def slow(r):  # 慢镜头时音效拉长
    return 1 / max(0.15, min(1.0, r))


swatch_notes = [69, 72, 76, 79, 81, 84, 88, 91]
for c in CUES:
    t, ty, r = c['t'], c['type'], c.get('r', 1)
    v = c.get('v', 1)
    if ty == 'key':
        place(sfx, ui_key(0.6 + 0.4 * v), t + rng.random() * 0.004, pan=rng.uniform(-0.2, 0.2))
    elif ty == 'enter':
        place(sfx, ui_enter(), t)
    elif ty == 'tick':
        place(sfx, ui_tick(v), t, pan=0.2, send=0.3)
    elif ty == 'tool':
        place(sfx, bell(note_hz(84), 0.5, 0.8), t, send=0.5)
    elif ty == 'click':
        place(sfx, ui_click(v), t)
    elif ty == 'grab':
        place(sfx, lp(noise(0.08), 900) * env_exp(int(0.08 * SR), 0.015) * 0.5, t)
    elif ty == 'lift':
        d = min(1.4, 0.35 * slow(r))
        place(sfx, ui_lift(d, 0.9), t, send=0.4)
    elif ty == 'flip':
        d = min(1.2, 0.2 * slow(r))
        place(sfx, ui_flip(d, 0.8 if r < 0.5 else 0.5), t, pan=rng.uniform(-0.3, 0.3), send=0.4)
    elif ty == 'dropStart':
        d = min(0.9, 0.22 * slow(r))
        place(sfx, whoosh(d, 0.5, 1800, 400), t)
    elif ty == 'drop':
        place(sfx, ui_drop(1.0), t, send=0.35)
        if r < 0.5:  # 慢镜头里的落定：再加一记低频冲击
            place(sfx, boom(0.6, 1.8, 70, 30), t, send=0.3)
    elif ty == 'whoosh':
        d = c.get('dur', 0.8)
        place(sfx, whoosh(d, v, 250, 4200), t, pan=-0.3, send=0.3)
    elif ty == 'swish':
        place(sfx, whoosh(0.35, 0.5, 600, 5000), t)
    elif ty == 'cut':
        place(sfx, whoosh(0.4, 0.55, 500, 6000), t - 0.2, send=0.2)
    elif ty == 'pop':
        place(sfx, ui_pop(), t, send=0.3)
    elif ty == 'check':
        place(sfx, bell(note_hz(88), 0.6, 1.0), t + 0.03, send=0.5)
        place(sfx, bell(note_hz(93), 0.45, 1.0), t + 0.11, send=0.5)
    elif ty == 'swatch':
        place(sfx, bell(note_hz(swatch_notes[c.get('i', 0) % 8]), 0.9, 1.4), t, pan=-0.5 + 0.14 * c.get('i', 0), send=0.6)
    elif ty == 'hit':
        place(sfx, boom(0.7 * v, 2.0, 80, 35), t, send=0.3)
        place(sfx, tom(0.6 * v, 100, 60, 1.2), t, send=0.5)
    elif ty == 'impact':
        place(sfx, boom(1.1 * v, 3.5), t, send=0.4)
        place(sfx, hp(noise(2.5), 3000) * env_exp(int(2.5 * SR), 0.5) * 0.25 * v, t, send=0.6)  # 镲片
        place(sfx, tom(0.8 * v, 90, 50, 1.5), t, send=0.5)
    elif ty == 'riser':
        d = c.get('dur', 1.0)
        place(sfx, riser(d, 0.8), t, send=0.3)
    elif ty == 'slowdown':
        place(sfx, tapestop(0.9, 0.7), t, send=0.4)
    elif ty == 'speedup':
        place(sfx, tapestop(0.5, 0.5, up=True), t - 0.25, send=0.2)
    elif ty == 'end':
        place(sfx, boom(0.7, 3.0, 55, 26), t, send=0.5)


# ---------------------------------------------------------------- 混响 + 母带
def make_ir(dur=2.6):
    n = int(dur * SR)
    e = np.exp(-np.arange(n) / (0.55 * SR))
    L = lp(rng.standard_normal(n), 6000) * e
    R = lp(rng.standard_normal(n), 6000) * e
    pre = int(0.02 * SR)
    ir = np.zeros((n + pre, 2))
    ir[pre:, 0], ir[pre:, 1] = L, R
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


ir = make_ir()
wet = np.stack([signal.fftconvolve(verb_send[:, ch], ir[:, ch])[:N] for ch in range(2)], axis=1)

mix = music * 0.85 + sfx * 1.0 + wet * 0.35
mix = hp(mix, 25)
# 淡出到结尾，保证最后一帧静音
fade = np.ones(N)
fn = int(1.2 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 2
mix *= fade[:, None]
# 柔性限幅 + 归一化
peak = np.max(np.abs(mix))
mix = mix / peak * 1.6
mix = np.tanh(mix) / np.tanh(1.6)
mix *= 10 ** (-1 / 20)
wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
print(f'wrote {out_path}: {DUR:.2f}s, {len(CUES)} cues')
