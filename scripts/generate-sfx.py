"""
Synthesizes layered, stereo broadcast-grade cricket SFX WAV files into public/sfx/.
Uses only Python stdlib (math, random, struct, wave, os, subprocess) for zero dependency issues.
"""
import math
import os
import random
import struct
import subprocess
import wave

SAMPLE_RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "sfx")


def clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def soft_clip(v: float, drive: float = 1.35) -> float:
    return math.tanh(v * drive) / math.tanh(drive)


def make_buffer(duration_sec: float) -> tuple[list[float], list[float]]:
    n = int(SAMPLE_RATE * duration_sec)
    return [0.0] * n, [0.0] * n


def pink_noise_samples(n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
    out = [0.0] * n
    for i in range(n):
        white = rng.uniform(-1.0, 1.0)
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
        b6 = white * 0.115926
    return out


def biquad_bandpass(samples: list[float], center_hz: float, q: float) -> list[float]:
    w0 = 2.0 * math.pi * center_hz / SAMPLE_RATE
    alpha = math.sin(w0) / (2.0 * q)
    b0 = alpha
    b1 = 0.0
    b2 = -alpha
    a0 = 1.0 + alpha
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha
    b0 /= a0
    b1 /= a0
    b2 /= a0
    a1 /= a0
    a2 /= a0
    x1 = x2 = y1 = y2 = 0.0
    out = [0.0] * len(samples)
    for i, x0 in enumerate(samples):
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = y0
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def add_crowd_roar(L: list[float], R: list[float], start_s: float, dur_s: float, peak_s: float, gain: float, seed: int):
    n = int(dur_s * SAMPLE_RATE)
    start_idx = int(start_s * SAMPLE_RATE)
    raw_l = pink_noise_samples(n, seed)
    raw_r = pink_noise_samples(n, seed + 101)
    mid_l = biquad_bandpass(raw_l, 820.0, 0.7)
    mid_r = biquad_bandpass(raw_r, 910.0, 0.7)
    hi_l = biquad_bandpass(raw_l, 2400.0, 1.1)
    hi_r = biquad_bandpass(raw_r, 2600.0, 1.1)
    peak_n = max(1, int(peak_s * SAMPLE_RATE))
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        if i < peak_n:
            env = math.sin((i / peak_n) * (math.pi / 2.0)) ** 1.3
        else:
            t_rem = (i - peak_n) / max(1, n - peak_n)
            env = math.cos(t_rem * (math.pi / 2.0)) ** 1.6
        # Subtle organic stadium swell modulation
        t = i / SAMPLE_RATE
        swell = 1.0 + 0.14 * math.sin(2.0 * math.pi * 2.1 * t) + 0.08 * math.sin(2.0 * math.pi * 4.7 * t + 0.8)
        L[idx] += (mid_l[i] * 1.45 + hi_l[i] * 0.65) * env * swell * gain
        R[idx] += (mid_r[i] * 1.45 + hi_r[i] * 0.65) * env * swell * gain


def add_wood_hit(L: list[float], R: list[float], start_s: float, freqs: list[float], decay_s: float, gain: float, pan: float = 0.0, seed: int = 7):
    start_idx = int(start_s * SAMPLE_RATE)
    n = int(decay_s * SAMPLE_RATE)
    rng = random.Random(seed)
    pan_l = math.cos((pan + 1.0) * math.pi / 4.0)
    pan_r = math.sin((pan + 1.0) * math.pi / 4.0)
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        t = i / SAMPLE_RATE
        env = math.exp(-t / (decay_s * 0.22))
        snap = math.exp(-t / 0.0045) * rng.uniform(-1.0, 1.0) * 0.9
        body = 0.0
        for k, f in enumerate(freqs):
            body += math.sin(2.0 * math.pi * f * t * (1.0 + 0.06 * math.exp(-t / 0.01))) * (0.65 ** k)
        val = (body * 0.55 + snap) * env * gain
        L[idx] += val * pan_l
        R[idx] += val * pan_r


def add_sub_drop(L: list[float], R: list[float], start_s: float, dur_s: float, f_start: float, f_end: float, gain: float):
    start_idx = int(start_s * SAMPLE_RATE)
    n = int(dur_s * SAMPLE_RATE)
    phase = 0.0
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        t = i / SAMPLE_RATE
        progress = i / max(1, n)
        freq = f_end + (f_start - f_end) * math.exp(-progress * 5.2)
        phase += 2.0 * math.pi * freq / SAMPLE_RATE
        env = min(1.0, t / 0.008) * math.exp(-t / (dur_s * 0.36))
        val = (math.sin(phase) * 0.85 + math.sin(phase * 2.0) * 0.22) * env * gain
        L[idx] += val
        R[idx] += val


def add_brass_note(L: list[float], R: list[float], start_s: float, dur_s: float, freq: float, gain: float, pan: float = 0.0, bright: float = 1.0):
    start_idx = int(start_s * SAMPLE_RATE)
    n = int(dur_s * SAMPLE_RATE)
    pan_l = math.cos((pan + 1.0) * math.pi / 4.0)
    pan_r = math.sin((pan + 1.0) * math.pi / 4.0)
    detunes = (-0.0045, 0.0, 0.0048)
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        t = i / SAMPLE_RATE
        attack = min(1.0, t / 0.025)
        release = min(1.0, (dur_s - t) / max(0.06, dur_s * 0.35))
        env = attack * max(0.0, release) * (0.65 + 0.35 * math.exp(-t / 0.18))
        sig = 0.0
        for d in detunes:
            f = freq * (1.0 + d)
            w = 2.0 * math.pi * f * t
            # Rich brass-like odd+even harmonic stack
            sig += (
                1.00 * math.sin(w)
                + 0.55 * bright * math.sin(2.0 * w)
                + 0.36 * bright * math.sin(3.0 * w)
                + 0.20 * bright * math.sin(4.0 * w)
                + 0.10 * bright * math.sin(5.0 * w)
            )
        val = (sig / len(detunes)) * 0.35 * env * gain
        L[idx] += val * pan_l
        R[idx] += val * pan_r


def add_bell_note(L: list[float], R: list[float], start_s: float, dur_s: float, freq: float, gain: float, pan: float = 0.0):
    start_idx = int(start_s * SAMPLE_RATE)
    n = int(dur_s * SAMPLE_RATE)
    pan_l = math.cos((pan + 1.0) * math.pi / 4.0)
    pan_r = math.sin((pan + 1.0) * math.pi / 4.0)
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        t = i / SAMPLE_RATE
        env = min(1.0, t / 0.006) * math.exp(-t / (dur_s * 0.28))
        w = 2.0 * math.pi * freq * t
        val = (
            math.sin(w) * 0.72
            + math.sin(2.0 * w) * 0.28 * math.exp(-t / 0.12)
            + math.sin(3.0 * w) * 0.14 * math.exp(-t / 0.07)
            + math.sin(4.18 * w) * 0.07 * math.exp(-t / 0.04)
        ) * env * gain
        L[idx] += val * pan_l
        R[idx] += val * pan_r


def add_whoosh(L: list[float], R: list[float], start_s: float, dur_s: float, gain: float, seed: int):
    n = int(dur_s * SAMPLE_RATE)
    start_idx = int(start_s * SAMPLE_RATE)
    raw = pink_noise_samples(n, seed)
    filt = biquad_bandpass(raw, 1100.0, 1.4)
    for i in range(n):
        idx = start_idx + i
        if idx >= len(L):
            break
        u = i / max(1, n)
        env = math.sin(u * math.pi) ** 1.8
        pan = -0.6 + 1.2 * u
        pan_l = math.cos((pan + 1.0) * math.pi / 4.0)
        pan_r = math.sin((pan + 1.0) * math.pi / 4.0)
        v = filt[i] * env * gain * 2.2
        L[idx] += v * pan_l
        R[idx] += v * pan_r


def save_wav(filename: str, L: list[float], R: list[float]):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    peak = max(max((abs(x) for x in L), default=1e-6), max((abs(x) for x in R), default=1e-6))
    norm = 0.90 / peak if peak > 1e-6 else 1.0
    frames = bytearray()
    for l_val, r_val in zip(L, R):
        sl = int(clamp(soft_clip(l_val * norm, 1.2)) * 32767)
        sr = int(clamp(soft_clip(r_val * norm, 1.2)) * 32767)
        frames += struct.pack("<hh", sl, sr)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(frames)
    print(f"Generated {path} ({len(L) / SAMPLE_RATE:.2f}s)")


def generate_four():
    L, R = make_buffer(2.2)
    # Willow bat crack + impact sub
    add_wood_hit(L, R, 0.00, [440, 1180, 2240], 0.12, 0.85, 0.0, seed=11)
    add_sub_drop(L, R, 0.02, 0.38, 125.0, 48.0, 0.55)
    add_whoosh(L, R, 0.04, 0.42, 0.45, seed=12)
    # Bright energetic broadcast stab (C major 9 punch)
    add_brass_note(L, R, 0.06, 0.24, 523.25, 0.55, -0.35, 1.0)  # C5
    add_brass_note(L, R, 0.14, 0.28, 659.25, 0.58, 0.35, 1.0)   # E5
    add_brass_note(L, R, 0.22, 0.65, 783.99, 0.65, -0.2, 1.1)   # G5
    add_brass_note(L, R, 0.22, 0.72, 1046.50, 0.60, 0.2, 1.1)   # C6
    add_bell_note(L, R, 0.22, 0.85, 1046.50, 0.35, 0.0)
    # Crowd cheer swell
    add_crowd_roar(L, R, 0.08, 2.05, 0.38, 0.72, seed=13)
    save_wav("four.wav", L, R)


def generate_six():
    L, R = make_buffer(2.85)
    # Massive sweet-spot willow crack + deep stadium cannon boom
    add_wood_hit(L, R, 0.00, [380, 1050, 2100], 0.15, 0.95, 0.0, seed=21)
    add_sub_drop(L, R, 0.00, 0.62, 145.0, 36.0, 0.95)
    add_whoosh(L, R, 0.02, 0.52, 0.65, seed=22)
    # Triumphant broadcast fanfare climb (G4 -> C5 -> E5 -> G5 -> C6 chord!)
    add_brass_note(L, R, 0.05, 0.22, 392.00, 0.55, -0.45, 1.1)
    add_brass_note(L, R, 0.14, 0.22, 523.25, 0.60, 0.45, 1.1)
    add_brass_note(L, R, 0.23, 0.24, 659.25, 0.65, -0.35, 1.15)
    add_brass_note(L, R, 0.32, 0.95, 783.99, 0.72, -0.25, 1.2)
    add_brass_note(L, R, 0.32, 1.05, 1046.50, 0.75, 0.25, 1.2)
    add_brass_note(L, R, 0.32, 1.05, 523.25, 0.55, 0.0, 0.9)
    add_sub_drop(L, R, 0.32, 0.50, 110.0, 42.0, 0.70)
    add_bell_note(L, R, 0.34, 1.10, 1567.98, 0.32, 0.15)
    # Massive crowd eruption
    add_crowd_roar(L, R, 0.05, 2.75, 0.48, 0.92, seed=23)
    save_wav("six.wav", L, R)


def generate_wicket():
    L, R = make_buffer(2.65)
    # 3 staggered timber stump & flying bail impacts!
    add_wood_hit(L, R, 0.00, [560, 1340, 2450], 0.14, 1.00, -0.25, seed=31)
    add_wood_hit(L, R, 0.038, [720, 1620, 2890], 0.12, 0.85, 0.30, seed=32)
    add_wood_hit(L, R, 0.088, [880, 1940, 3200], 0.10, 0.65, -0.10, seed=33)
    # Dramatic cinematic broadcast sub drop & dark tension brass horn
    add_sub_drop(L, R, 0.02, 0.95, 115.0, 32.0, 1.00)
    add_brass_note(L, R, 0.06, 1.15, 146.83, 0.78, -0.35, 1.25)  # D3
    add_brass_note(L, R, 0.06, 1.15, 174.61, 0.62, 0.35, 1.15)   # F3
    add_brass_note(L, R, 0.08, 1.10, 207.65, 0.58, 0.0, 1.25)    # Ab3 (dramatic diminished!)
    add_brass_note(L, R, 0.12, 0.95, 293.66, 0.45, 0.2, 1.1)     # D4
    # Stadium gasp -> dramatic roar
    add_crowd_roar(L, R, 0.10, 2.50, 0.42, 0.88, seed=34)
    save_wav("wicket.wav", L, R)


def generate_over():
    L, R = make_buffer(0.85)
    add_whoosh(L, R, 0.0, 0.32, 0.35, seed=41)
    add_bell_note(L, R, 0.04, 0.45, 659.25, 0.65, -0.2)  # E5
    add_bell_note(L, R, 0.17, 0.62, 987.77, 0.72, 0.2)   # B5
    save_wav("over.wav", L, R)


def generate_milestone():
    L, R = make_buffer(2.35)
    add_whoosh(L, R, 0.0, 0.35, 0.40, seed=51)
    add_brass_note(L, R, 0.05, 0.22, 523.25, 0.55, -0.3, 1.0)
    add_brass_note(L, R, 0.20, 0.22, 587.33, 0.58, 0.0, 1.0)
    add_brass_note(L, R, 0.35, 0.24, 659.25, 0.62, 0.3, 1.05)
    add_brass_note(L, R, 0.50, 0.95, 783.99, 0.65, -0.2, 1.1)
    add_brass_note(L, R, 0.50, 1.05, 1046.50, 0.70, 0.2, 1.1)
    add_bell_note(L, R, 0.50, 1.10, 1046.50, 0.45, 0.0)
    add_crowd_roar(L, R, 0.15, 2.15, 0.55, 0.78, seed=52)
    save_wav("milestone.wav", L, R)


def generate_sub_alert():
    L, R = make_buffer(0.75)
    add_bell_note(L, R, 0.00, 0.30, 783.99, 0.60, -0.25)  # G5
    add_bell_note(L, R, 0.10, 0.35, 1046.50, 0.68, 0.0)   # C6
    add_bell_note(L, R, 0.20, 0.52, 1318.51, 0.72, 0.25)  # E6
    save_wav("sub-alert.wav", L, R)


if __name__ == "__main__":
    generate_four()
    generate_six()
    generate_wicket()
    generate_over()
    generate_milestone()
    generate_sub_alert()
    print("All broadcast SFX WAV assets generated successfully.")
