#!/usr/bin/env python3
"""全部用代码合成的配乐与音效（无任何采样/版权素材）。

读取 render.mjs 导出的 out/cues.json（导演页在真实交互发生的那一帧写入的提示点），
把 UI 音效精确放到对应时间；配乐按 SPEC.md 的“音乐段落”表生成，与剪辑点对齐。

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


# ---------------------------------------------------------------- 配乐（SPEC 驱动）
CHORDS = {  # 根音 + 和弦音（A 小调，可按 SPEC 的调性改）
    'Am': (45, [57, 60, 64]), 'F': (41, [57, 60, 65]), 'C': (48, [55, 60, 64]),
    'G': (43, [55, 59, 62]), 'E': (40, [56, 59, 64]), 'Dm': (38, [57, 62, 65]),
}


def beats(a, b, step=BEAT, offset=0.0):
    t = a + offset
    while t < b - 1e-6:
        yield t
        t += step


# 节拍表：从 SPEC.md 的“音乐段落”一栏抄过来。每段 (起点秒, 终点秒, 段落类型, 参数)
SECTIONS = [
    (0.0, 2.0, 'ambient', {'chord': 'Am'}),
    (2.0, 4.5, 'build',   {'chord': 'F'}),
    (4.5, 6.0, 'drop',    {'chord': 'C'}),
    (6.0, DUR, 'outro',   {'chord': 'Am'}),
]
HITS = []  # 单次强调：如 [(4.5, 'boom')]，可选 boom/braam/riser/tapestop/whoosh


def sec_ambient(b0, b1, p):
    """氛围铺底：宽阔的 pad + 偶尔的稀疏拨弦"""
    dur = b1 - b0
    if dur <= 0:
        return
    root, notes = CHORDS[p.get('chord', 'Am')]
    place(music, pad([root] + notes, dur + 0.3, v=1.2, bright=800, attack=1.0, release=0.8), b0, send=0.5)
    place(music, pad([n + 24 for n in notes[:2]], dur, v=0.3, bright=2500, attack=2.0, release=0.5), b0 + 0.2, send=0.6)
    arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12]
    for i, t in enumerate(beats(b0, b1, BEAT * 2)):
        place(music, pluck(arp[i % len(arp)], 0.4, 0.5, 2200), t, pan=-0.3 if i % 2 else 0.3, send=0.4)


def sec_build(b0, b1, p):
    """铺垫：pad + 逐渐加密的鼓点 + 段末上升音"""
    dur = b1 - b0
    if dur <= 0:
        return
    root, notes = CHORDS[p.get('chord', 'F')]
    place(music, pad([root + 12] + notes, dur + 0.3, v=0.9, bright=1200, attack=0.05, release=1.0), b0, send=0.5)
    for t in beats(b0, b1, BEAT / 2):
        frac = (t - b0) / max(dur, 1e-6)
        place(music, bass(root - 12, BEAT / 2 * 0.9, 0.4 + 0.25 * frac), t)
    for i, t in enumerate(beats(b0, b1, BEAT / 4)):
        frac = (t - b0) / max(dur, 1e-6)
        if frac > 0.4:
            place(music, tom(0.2 + 0.5 * frac, 130, 90, 0.4), t, pan=0.3 * np.sin(t * 9), send=0.2)
    riser_dur = min(0.9, dur * 0.4)
    if riser_dur > 0.05:
        place(music, riser(riser_dur, 0.7), b1 - riser_dur, send=0.3)


def sec_drop(b0, b1, p):
    """高潮落地：满编制鼓组 + 贝斯 + 段首铜管冲击"""
    dur = b1 - b0
    if dur <= 0:
        return
    root, notes = CHORDS[p.get('chord', 'C')]
    place(music, braam(root - 12, min(2.2, dur + 0.5), 0.8), b0, send=0.3)
    place(music, pad([root + 12] + notes, dur + 0.3, v=0.75, bright=1800, attack=0.02, release=0.6), b0, send=0.5)
    for i, t in enumerate(beats(b0, b1)):
        place(music, kick(0.95), t)
        place(music, tom(0.5, 100, 65), t + BEAT / 2, pan=-0.3, send=0.25)
        if i % 2:
            place(music, snare(0.6), t, send=0.3)
    for t in beats(b0, b1, BEAT / 4):
        place(music, hat(0.5), t, pan=0.4)
    for t in beats(b0, b1, BEAT / 2):
        place(music, bass(root - 12, BEAT / 2 * 0.85, 0.7), t)


def sec_break(b0, b1, p):
    """断点：磁带急停 + 安静的 pad"""
    dur = b1 - b0
    if dur <= 0:
        return
    place(music, tapestop(min(0.7, dur * 0.6), 0.7), b0, send=0.3)
    root, notes = CHORDS[p.get('chord', 'Am')]
    place(music, pad([root] + notes, dur, v=0.4, bright=700, attack=0.6, release=0.8), b0, send=0.6)


def sec_outro(b0, b1, p):
    """结尾：pad + 钟声，逐渐淡出"""
    dur = b1 - b0
    if dur <= 0:
        return
    root, notes = CHORDS[p.get('chord', 'Am')]
    place(music, pad([root] + notes + [notes[-1] + 12], dur + 0.3, v=0.55, bright=900, attack=0.02, release=min(2.6, dur)), b0, send=0.9)
    place(music, bell(note_hz(root + 36), 0.7, min(3.0, dur + 0.5)), b0 + 0.05, send=0.9)
    if dur > 0.5:
        place(music, bell(note_hz(root + 31), 0.4, min(2.8, dur + 0.3)), b0 + 0.55, pan=0.3, send=0.9)


HIT_FN = {
    'boom': lambda t: place(music, boom(0.8, 2.4), t, send=0.4),
    'braam': lambda t: place(music, braam(33, 2.4, 0.8), t, send=0.4),
    'riser': lambda t: place(music, riser(1.0, 0.7), t, send=0.3),
    'tapestop': lambda t: place(music, tapestop(0.7, 0.7), t, send=0.3),
    'whoosh': lambda t: place(music, whoosh(0.6, 0.6, 300, 4000), t, send=0.3),
}

SECTION_FN = {
    'ambient': sec_ambient,
    'build': sec_build,
    'drop': sec_drop,
    'break': sec_break,
    'outro': sec_outro,
}

for s0, s1, kind, params in SECTIONS:
    if s0 >= DUR:
        continue
    s0c, s1c = max(0.0, s0), min(DUR, s1)
    if s1c <= s0c:
        continue
    fn = SECTION_FN.get(kind)
    if fn is None:
        print(f'warning: unknown section type {kind!r}, skipped', file=sys.stderr)
        continue
    fn(s0c, s1c, params)

for t, name in HITS:
    if t >= DUR:
        continue
    fn = HIT_FN.get(name)
    if fn is None:
        print(f'warning: unknown hit type {name!r}, skipped', file=sys.stderr)
        continue
    fn(t)


# ---------------------------------------------------------------- UI 音效按提示点放置
def slow(r):  # 慢镜头时音效拉长
    return 1 / max(0.15, min(1.0, r))


def _sfx_click(c):
    place(sfx, ui_click(c.get('v', 1)), c['t'])


def _sfx_grab(c):
    place(sfx, lp(noise(0.08), 900) * env_exp(int(0.08 * SR), 0.015) * 0.5, c['t'])


def _sfx_lift(c):
    r = c.get('r', 1)
    d = min(1.4, 0.35 * slow(r))
    place(sfx, ui_lift(d, 0.9), c['t'], send=0.4)


def _sfx_flip(c):
    r = c.get('r', 1)
    d = min(1.2, 0.2 * slow(r))
    place(sfx, ui_flip(d, 0.8 if r < 0.5 else 0.5), c['t'], pan=rng.uniform(-0.3, 0.3), send=0.4)


def _sfx_drop_start(c):
    r = c.get('r', 1)
    d = min(0.9, 0.22 * slow(r))
    place(sfx, whoosh(d, 0.5, 1800, 400), c['t'])


def _sfx_drop(c):
    r = c.get('r', 1)
    place(sfx, ui_drop(1.0), c['t'], send=0.35)
    if r < 0.5:  # 慢镜头里的落定：再加一记低频冲击
        place(sfx, boom(0.6, 1.8, 70, 30), c['t'], send=0.3)


def _sfx_whoosh(c):
    d = c.get('dur', 0.8)
    v = c.get('v', 1)
    place(sfx, whoosh(d, v, 250, 4200), c['t'], pan=-0.3, send=0.3)


def _sfx_slowdown(c):
    place(sfx, tapestop(0.9, 0.7), c['t'], send=0.4)


def _sfx_speedup(c):
    place(sfx, tapestop(0.5, 0.5, up=True), c['t'] - 0.25, send=0.2)


def _sfx_impact(c):
    v = c.get('v', 1)
    place(sfx, boom(1.1 * v, 3.5), c['t'], send=0.4)
    place(sfx, hp(noise(2.5), 3000) * env_exp(int(2.5 * SR), 0.5) * 0.25 * v, c['t'], send=0.6)  # 镲片
    place(sfx, tom(0.8 * v, 90, 50, 1.5), c['t'], send=0.5)


def _sfx_end(c):
    place(sfx, boom(0.7, 3.0, 55, 26), c['t'], send=0.5)


def _sfx_key(c):
    v = c.get('v', 1)
    place(sfx, ui_key(0.6 + 0.4 * v), c['t'] + rng.random() * 0.004, pan=rng.uniform(-0.2, 0.2))


# 提示点类型 → 放置函数。cue 至少含 't'（秒），可选 'r'（慢镜倍率）、'v'（力度）、'dur'
SFX = {
    'click': _sfx_click,
    'grab': _sfx_grab,
    'lift': _sfx_lift,
    'flip': _sfx_flip,
    'dropStart': _sfx_drop_start,
    'drop': _sfx_drop,
    'whoosh': _sfx_whoosh,
    'slowdown': _sfx_slowdown,
    'speedup': _sfx_speedup,
    'impact': _sfx_impact,
    'end': _sfx_end,
    'key': _sfx_key,
    # 以下为其它通用 UI 音效，可直接在剧本里 cue('pop') 等使用
    'enter': lambda c: place(sfx, ui_enter(), c['t']),
    'tick': lambda c: place(sfx, ui_tick(c.get('v', 1)), c['t'], pan=0.2, send=0.3),
    'tool': lambda c: place(sfx, bell(note_hz(84), 0.5, 0.8), c['t'], send=0.5),
    'swish': lambda c: place(sfx, whoosh(0.35, 0.5, 600, 5000), c['t']),
    'cut': lambda c: place(sfx, whoosh(0.4, 0.55, 500, 6000), c['t'] - 0.2, send=0.2),
    'pop': lambda c: place(sfx, ui_pop(), c['t'], send=0.3),
    'check': lambda c: (place(sfx, bell(note_hz(88), 0.6, 1.0), c['t'] + 0.03, send=0.5),
                        place(sfx, bell(note_hz(93), 0.45, 1.0), c['t'] + 0.11, send=0.5)),
    'swatch': lambda c: place(sfx, bell(note_hz([69, 72, 76, 79, 81, 84, 88, 91][c.get('i', 0) % 8]), 0.9, 1.4),
                              c['t'], pan=-0.5 + 0.14 * (c.get('i', 0) % 8), send=0.6),
    'hit': lambda c: (place(sfx, boom(0.7 * c.get('v', 1), 2.0, 80, 35), c['t'], send=0.3),
                      place(sfx, tom(0.6 * c.get('v', 1), 100, 60, 1.2), c['t'], send=0.5)),
    'riser': lambda c: place(sfx, riser(c.get('dur', 1.0), 0.8), c['t'], send=0.3),
    'section': lambda c: None,  # 仅作标记，配乐由 SECTIONS 决定
}

for c in CUES:
    ty = c.get('type')
    fn = SFX.get(ty)
    if fn is None:
        print(f'warning: unknown cue type {ty!r}, skipped', file=sys.stderr)
        continue
    fn(c)


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
if peak > 0:
    mix = mix / peak * 1.6
mix = np.tanh(mix) / np.tanh(1.6)
mix *= 10 ** (-1 / 20)
wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
print(f'wrote {out_path}: {DUR:.2f}s, {len(CUES)} cues')
