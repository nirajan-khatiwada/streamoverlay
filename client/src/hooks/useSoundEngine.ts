import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundEventKey, StudioConfig } from '@shared/types';

export const DEFAULT_SFX_URLS: Record<SoundEventKey, string> = {
  four: '/sfx/four.wav',
  six: '/sfx/six.wav',
  wicket: '/sfx/wicket.wav',
  over: '/sfx/over.wav',
  milestone: '/sfx/milestone.wav',
  subAlert: '/sfx/sub-alert.wav',
};

export const DEFAULT_STADIUM_AMBIENT_URL = '/sfx/stadium-ambient.mp3';

/**
 * Low-latency Web Audio API sound engine for OBS Studio Browser Source & Studio previews.
 * - Plays continuous live stadium crowd background ambience looping seamlessly in real-time.
 * - Preloads built-in mastered WAV assets (and user-uploaded custom SFX overrides).
 * - Falls back to procedural Web Audio synthesis if audio decoding fails.
 * - Respects master mute/volume, ambient volume, and per-event channel settings live from StudioConfig.
 */
export function useSoundEngine(config: StudioConfig | null, mutedByPreview = false) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    try {
      if (!ctxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        ctxRef.current = new AudioCtx();
      }
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume();
      }
      setAudioBlocked(ctxRef.current.state === 'suspended');
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  const loadBuffer = useCallback(
    async (ctx: AudioContext, url: string): Promise<AudioBuffer | null> => {
      const existing = bufferCacheRef.current.get(url);
      if (existing) return existing;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        bufferCacheRef.current.set(url, decoded);
        return decoded;
      } catch {
        return null;
      }
    },
    []
  );

  // Continuous live stadium crowd background ambience
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!ambientAudioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      ambientAudioRef.current = audio;
    }

    const audio = ambientAudioRef.current;
    const ambientCfg = config?.audio?.stadiumAmbient;
    const masterEnabled = config?.audio?.masterEnabled ?? true;
    const masterVol = config?.audio?.masterVolume ?? 0.85;
    const ambientEnabled = ambientCfg?.enabled ?? true;
    const ambientVol = ambientCfg?.volume ?? 0.4;
    const targetUrl = ambientCfg?.customUrl || DEFAULT_STADIUM_AMBIENT_URL;

    try {
      const targetFull = new URL(targetUrl, window.location.href).href;
      if (audio.src !== targetFull) {
        audio.src = targetUrl;
        audio.load();
      }
    } catch {
      audio.src = targetUrl;
    }

    const effectiveVolume = Math.min(1, Math.max(0, masterVol * ambientVol));
    audio.volume = effectiveVolume;

    const shouldPlay =
      !mutedByPreview && masterEnabled && ambientEnabled && effectiveVolume > 0.001;

    if (shouldPlay) {
      if (audio.paused) {
        audio.play().catch(() => {
          setAudioBlocked(true);
        });
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }, [config?.audio, mutedByPreview]);

  // Clean up ambient audio on unmount
  useEffect(() => {
    return () => {
      if (ambientAudioRef.current) {
        ambientAudioRef.current.pause();
        ambientAudioRef.current.src = '';
      }
    };
  }, []);

  // Unlock AudioContext & resume stadium ambience on pointer/key interaction in normal browser tabs
  useEffect(() => {
    const unlock = () => {
      void ensureContext();
      if (ambientAudioRef.current && ambientAudioRef.current.paused) {
        const ambientCfg = config?.audio?.stadiumAmbient;
        const masterEnabled = config?.audio?.masterEnabled ?? true;
        const ambientEnabled = ambientCfg?.enabled ?? true;
        const masterVol = config?.audio?.masterVolume ?? 0.85;
        const ambientVol = ambientCfg?.volume ?? 0.4;
        const shouldPlay =
          !mutedByPreview && masterEnabled && ambientEnabled && masterVol * ambientVol > 0.001;
        if (shouldPlay) {
          ambientAudioRef.current.play().catch(() => {});
        }
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [config?.audio, ensureContext, mutedByPreview]);

  const playSynthFallback = useCallback((ctx: AudioContext, key: SoundEventKey, volume: number) => {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, volume * 0.45), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    gain.connect(ctx.destination);

    const freqs: Record<SoundEventKey, number[]> = {
      four: [523.25, 659.25, 783.99, 1046.5],
      six: [392.0, 523.25, 659.25, 783.99, 1046.5],
      wicket: [220, 185, 146.83],
      over: [659.25, 987.77],
      milestone: [523.25, 659.25, 783.99, 1046.5],
      subAlert: [783.99, 1046.5, 1318.5],
    };

    (freqs[key] ?? [440]).forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = key === 'wicket' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.08);
      osc.connect(gain);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.35);
    });
  }, []);

  const playSound = useCallback(
    async (key: SoundEventKey, forceEvenIfPreview = false) => {
      if (mutedByPreview && !forceEvenIfPreview) return;
      const audioCfg = config?.audio;
      if (audioCfg && !audioCfg.masterEnabled) return;
      const ch = audioCfg?.channels?.[key];
      if (ch && !ch.enabled) return;

      const volume = Math.min(
        1,
        Math.max(0, (audioCfg?.masterVolume ?? 0.85) * (ch?.volume ?? 0.9))
      );
      if (volume <= 0.001) return;

      const ctx = await ensureContext();
      if (!ctx) return;

      const targetUrl = ch?.customUrl || DEFAULT_SFX_URLS[key];
      const buffer = await loadBuffer(ctx, targetUrl);

      if (buffer) {
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        source.buffer = buffer;
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
      } else {
        playSynthFallback(ctx, key, volume);
      }
    },
    [config, ensureContext, loadBuffer, mutedByPreview, playSynthFallback]
  );

  return { playSound, audioBlocked, unlockAudio: ensureContext };
}
