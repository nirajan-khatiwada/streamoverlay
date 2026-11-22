import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundEventKey, StudioConfig } from '@shared/types';

const DEFAULT_SFX_URLS: Record<SoundEventKey, string> = {
  four: '/sfx/four.wav',
  six: '/sfx/six.wav',
  wicket: '/sfx/wicket.wav',
  over: '/sfx/over.wav',
  milestone: '/sfx/milestone.wav',
  subAlert: '/sfx/sub-alert.wav',
};

/**
 * Low-latency Web Audio API sound engine for OBS Studio Browser Source & Studio previews.
 * - Preloads built-in mastered WAV assets (and user-uploaded custom SFX overrides).
 * - Falls back to procedural Web Audio synthesis if audio decoding fails.
 * - Respects master mute/volume and per-event channel settings live from StudioConfig.
 */
export function useSoundEngine(config: StudioConfig | null, mutedByPreview = false) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
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

  // Unlock AudioContext cleanly on any pointer/key interaction in normal browser tabs
  useEffect(() => {
    const unlock = () => {
      void ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureContext]);

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
