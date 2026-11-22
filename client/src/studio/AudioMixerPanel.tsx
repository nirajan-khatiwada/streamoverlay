import React, { useRef, useState } from 'react';
import type { SoundEventKey, StudioConfig } from '@shared/types';

interface AudioMixerPanelProps {
  config: StudioConfig;
  onPatchConfig: (patch: Partial<StudioConfig>) => Promise<void>;
  onTestSound: (key: SoundEventKey) => void;
}

const SOUND_CHANNELS: Array<{ key: SoundEventKey; label: string; desc: string }> = [
  { key: 'four', label: 'FOUR (4)', desc: 'Bat crack + rising broadcast hit + crowd cheer' },
  { key: 'six', label: 'SIX (6)', desc: 'Power bat crack + sub boom + triumphant fanfare + roar' },
  { key: 'wicket', label: 'WICKET (W)', desc: 'Timber stump shatter + cinematic drop + crowd gasp' },
  { key: 'over', label: 'OVER', desc: 'Crisp two-note over-complete broadcast chime' },
  { key: 'milestone', label: '50 / 100', desc: 'Celebratory brass fanfare + stadium applause' },
  { key: 'subAlert', label: 'SUB ALERT', desc: 'Glassy bell notification chime' },
];

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  config,
  onPatchConfig,
  onTestSound,
}) => {
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [uploadingKey, setUploadingKey] = useState<SoundEventKey | null>(null);
  const [uploadingAmbient, setUploadingAmbient] = useState(false);
  const [previewingAmbient, setPreviewingAmbient] = useState(false);
  const ambientPreviewRef = useRef<HTMLAudioElement | null>(null);

  const updateChannel = async (
    key: SoundEventKey,
    patch: Partial<StudioConfig['audio']['channels'][SoundEventKey]>
  ) => {
    await onPatchConfig({
      audio: {
        ...config.audio,
        channels: {
          ...config.audio.channels,
          [key]: {
            ...config.audio.channels[key],
            ...patch,
          },
        },
      },
    });
  };

  const updateAmbient = async (
    patch: Partial<StudioConfig['audio']['stadiumAmbient']>
  ) => {
    await onPatchConfig({
      audio: {
        ...config.audio,
        stadiumAmbient: {
          ...config.audio.stadiumAmbient,
          ...patch,
        },
      },
    });
  };

  const handleUploadAudio = async (
    key: SoundEventKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingKey(key);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads/audio', { method: 'POST', body: fd });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error || 'Audio upload failed.');
      }
      await updateChannel(key, { customUrl: body.url, enabled: true });
      setStatus({ kind: 'ok', text: `Loaded custom SFX "${file.name}" for ${key.toUpperCase()}.` });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload custom audio.',
      });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleUploadAmbient = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAmbient(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads/audio', { method: 'POST', body: fd });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error || 'Audio upload failed.');
      }
      await updateAmbient({ customUrl: body.url, enabled: true });
      setStatus({ kind: 'ok', text: `Loaded custom stadium ambient background sound: "${file.name}".` });
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload custom audio.',
      });
    } finally {
      setUploadingAmbient(false);
    }
  };

  const togglePreviewAmbient = () => {
    if (previewingAmbient && ambientPreviewRef.current) {
      ambientPreviewRef.current.pause();
      ambientPreviewRef.current = null;
      setPreviewingAmbient(false);
      return;
    }

    const url = config.audio.stadiumAmbient.customUrl || '/sfx/stadium-ambient.mp3';
    const audio = new Audio(url);
    const vol = Math.min(1, Math.max(0, config.audio.masterVolume * config.audio.stadiumAmbient.volume));
    audio.volume = vol > 0 ? vol : 0.4;
    ambientPreviewRef.current = audio;
    setPreviewingAmbient(true);

    audio.play().catch(() => {
      setPreviewingAmbient(false);
    });

    audio.onended = () => {
      setPreviewingAmbient(false);
      ambientPreviewRef.current = null;
    };
  };

  return (
    <div className="form-stack">
      <div className="field-hint">
        In OBS Studio, enable <strong>&ldquo;Control audio via OBS&rdquo;</strong> on the Browser Source properties so
        all live stadium background ambience and automatic event sound effects route cleanly into your OBS Audio Mixer.
      </div>

      {status ? (
        <div
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`status-banner ${status.kind === 'error' ? 'status-banner--error' : 'status-banner--ok'}`}
        >
          {status.text}
        </div>
      ) : null}

      <fieldset className="field-fieldset">
        <legend>Master Broadcast Audio</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.audio.masterEnabled}
            onChange={(e) =>
              void onPatchConfig({
                audio: { ...config.audio, masterEnabled: e.target.checked },
              })
            }
          />
          <span>Enable Broadcast Audio &amp; SFX</span>
        </label>

        <div className="field">
          <label htmlFor="master-volume">
            Master Volume ({Math.round(config.audio.masterVolume * 100)}%)
          </label>
          <input
            id="master-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.audio.masterVolume}
            onChange={(e) =>
              void onPatchConfig({
                audio: { ...config.audio, masterVolume: Number(e.target.value) },
              })
            }
          />
        </div>
      </fieldset>

      {/* Live Stadium Background Ambience (Plays continuously in background) */}
      <fieldset className="field-fieldset" style={{ border: '2px solid rgba(56, 189, 248, 0.45)', background: 'rgba(8, 28, 68, 0.35)' }}>
        <legend style={{ color: '#38bdf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🏟️ Live Stadium Background Ambience (Plays Continuously)
        </legend>
        <div className="field-hint" style={{ marginBottom: '12px' }}>
          Continuous live stadium crowd atmosphere, cheers, and ambience that plays in the background all the time to make viewers feel like they are inside the live stadium.
        </div>

        <div className="sfx-row" style={{ alignItems: 'center' }}>
          <div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={config.audio.stadiumAmbient.enabled}
                onChange={(e) => void updateAmbient({ enabled: e.target.checked })}
              />
              <strong>Stadium Crowd Ambience</strong>
            </label>
            <div className="field-hint" style={{ marginTop: '3px' }}>
              {config.audio.stadiumAmbient.customUrl ? 'Custom uploaded background' : 'Live Stadium Ambience (stadium-ambient.mp3)'}
            </div>
          </div>

          <div className="field">
            <label htmlFor="vol-stadium-ambient" className="visually-hidden">
              Stadium Ambience Volume
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                id="vol-stadium-ambient"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.audio.stadiumAmbient.volume}
                onChange={(e) => void updateAmbient({ volume: Number(e.target.value) })}
              />
              <span style={{ minWidth: '45px', fontSize: '13px', fontWeight: 'bold' }}>
                {Math.round(config.audio.stadiumAmbient.volume * 100)}%
              </span>
            </div>
            <span className="field-hint">Continuous looping crowd noise and stadium murmur</span>
          </div>

          <div className="btn-group">
            <button
              type="button"
              className={`btn btn--sm ${previewingAmbient ? 'btn--danger' : 'btn--primary'}`}
              onClick={togglePreviewAmbient}
            >
              {previewingAmbient ? 'Stop' : 'Preview'}
            </button>
            <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
              {uploadingAmbient ? '...' : 'Upload'}
              <input
                type="file"
                accept="audio/wav,audio/mpeg,audio/ogg,audio/webm,audio/mp4,.wav,.mp3,.ogg,.m4a"
                className="visually-hidden"
                onChange={(e) => void handleUploadAmbient(e)}
                disabled={uploadingAmbient}
              />
            </label>
            {config.audio.stadiumAmbient.customUrl ? (
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => void updateAmbient({ customUrl: null })}
              >
                Reset Default
              </button>
            ) : null}
          </div>
        </div>
      </fieldset>

      <div className="form-stack">
        <h4 style={{ margin: '14px 0 4px 0', color: '#cbd5e1' }}>Event Stinger Sound Effects (FOUR, SIX, WICKET)</h4>
        {SOUND_CHANNELS.map(({ key, label, desc }) => {
          const ch = config.audio.channels[key];
          return (
            <div key={key} className="sfx-row">
              <div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={ch.enabled}
                    onChange={(e) => void updateChannel(key, { enabled: e.target.checked })}
                  />
                  <strong>{label}</strong>
                </label>
                <div className="field-hint" style={{ marginTop: '3px' }}>
                  {ch.customUrl ? 'Custom audio' : 'Built-in WAV'}
                </div>
              </div>

              <div className="field">
                <label htmlFor={`vol-${key}`} className="visually-hidden">
                  {label} volume
                </label>
                <input
                  id={`vol-${key}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ch.volume}
                  onChange={(e) => void updateChannel(key, { volume: Number(e.target.value) })}
                />
                <span className="field-hint">{desc}</span>
              </div>

              <div className="btn-group">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => onTestSound(key)}
                >
                  Test
                </button>
                <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
                  {uploadingKey === key ? '...' : 'Upload'}
                  <input
                    type="file"
                    accept="audio/wav,audio/mpeg,audio/ogg,audio/webm,audio/mp4,.wav,.mp3,.ogg,.m4a"
                    className="visually-hidden"
                    onChange={(e) => void handleUploadAudio(key, e)}
                    disabled={uploadingKey === key}
                  />
                </label>
                {ch.customUrl ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    onClick={() => void updateChannel(key, { customUrl: null })}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
