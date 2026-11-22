import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundEventKey, StudioConfig } from '@shared/types';
import { useBroadcastSocket } from '../hooks/useBroadcastSocket';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { AudioMixerPanel } from './AudioMixerPanel';
import { BrandingPanel } from './BrandingPanel';
import { DirectorDeck } from './DirectorDeck';
import { MatchConnector } from './MatchConnector';
import { TickerSubPanel } from './TickerSubPanel';
import '../styles/studio.css';

type StudioTab = 'source' | 'branding' | 'tickers' | 'audio';

const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'source', label: 'Match Source' },
  { id: 'branding', label: 'Branding & Uploads' },
  { id: 'tickers', label: 'Subs & Donations' },
  { id: 'audio', label: 'Audio & SFX' },
];

export const StudioApp: React.FC = () => {
  const { wsConnected, snapshot, config, status, recentEvents, latestEvent } = useBroadcastSocket();
  const [studioAudioMonitor, setStudioAudioMonitor] = useState(false);
  const { playSound } = useSoundEngine(config, false);

  const [activeTab, setActiveTab] = useState<StudioTab>('source');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const obsDialogRef = useRef<HTMLDialogElement | null>(null);
  const lastHeardEventRef = useRef<string | null>(null);

  const overlayUrl = `${window.location.origin}/overlay`;

  useEffect(() => {
    document.title = 'Crex OBS Broadcast Studio';
  }, []);

  // Optional local audio monitoring in Studio (off by default so OBS + browser never double-play!)
  useEffect(() => {
    if (!studioAudioMonitor || !latestEvent || latestEvent.id === lastHeardEventRef.current) {
      return;
    }
    lastHeardEventRef.current = latestEvent.id;
    void playSound(latestEvent.soundKey, true);
  }, [latestEvent, playSound, studioAudioMonitor]);

  const patchConfig = useCallback(async (patch: Partial<StudioConfig>) => {
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }, []);

  const copyOverlayUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Fallback copy unavailable in insecure context
    }
  };

  const handleTestSound = useCallback(
    (key: SoundEventKey) => {
      void playSound(key, true);
    },
    [playSound]
  );

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(TABS[(idx + 1) % TABS.length]!.id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length]!.id);
    }
  };

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="studio-brand">
          <h1>Crex OBS Broadcast Studio</h1>
          <span className="studio-pill">
            <span
              className={`studio-dot ${
                wsConnected && !status?.lastError
                  ? 'studio-dot--live'
                  : status?.lastError
                    ? 'studio-dot--error'
                    : ''
              }`}
              aria-hidden="true"
            />
            {wsConnected ? 'WS LIVE' : 'RECONNECTING'}
          </span>
          {status?.activeMatchKey ? (
            <span className="studio-pill">MATCH #{status.activeMatchKey}</span>
          ) : null}
          <span className="studio-pill">OBS CLIENTS: {status?.clientsCount ?? 0}</span>
        </div>

        <div className="studio-obs-bar">
          <span className="studio-obs-url" title="Paste into OBS Browser Source">
            {overlayUrl}
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void copyOverlayUrl()}>
            {copiedUrl ? 'Copied OBS URL' : 'Copy OBS URL'}
          </button>
          <a
            href="/overlay"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--sm"
          >
            Open Overlay
          </a>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => obsDialogRef.current?.showModal()}
          >
            OBS Setup Guide
          </button>
        </div>
      </header>

      <main className="studio-main">
        {/* LEFT COLUMN: 16:9 Live Preview Monitor + Director Deck */}
        <div className="studio-col">
          <section className="studio-panel" aria-labelledby="monitor-heading">
            <div className="studio-panel-header">
              <h2 id="monitor-heading">
                Live Broadcast Output (16:9 · 1920×1080)
                {snapshot ? ` — ${snapshot.leftTeam.shortName} vs ${snapshot.rightTeam.shortName}` : ''}
              </h2>
              <label className="check-row" style={{ fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={studioAudioMonitor}
                  onChange={(e) => setStudioAudioMonitor(e.target.checked)}
                />
                <span>Monitor SFX in Studio</span>
              </label>
            </div>

            <div className="monitor-frame">
              <iframe
                title="Live OBS Broadcast Overlay Preview"
                src="/overlay?preview=1"
                className="monitor-iframe"
              />
            </div>

            <div className="monitor-footer">
              <div className="monitor-meta">
                <span>FORMAT: {snapshot?.formatLabel ?? '--'}</span>
                <span>STATUS: {snapshot?.status?.toUpperCase() ?? 'IDLE'}</span>
                <span>POLLS: {status?.pollCount ?? 0} ({status?.notModifiedCount ?? 0} cached 304)</span>
                {status?.lastPollAt ? (
                  <span>SYNC: {new Date(status.lastPollAt).toLocaleTimeString()}</span>
                ) : null}
              </div>
              {status?.lastError ? (
                <span style={{ color: '#f87171' }}>Error: {status.lastError}</span>
              ) : null}
            </div>
          </section>

          {config ? (
            <DirectorDeck
              config={config}
              simulatorRunning={Boolean(status?.simulatorRunning)}
              recentEvents={recentEvents}
              onPatchConfig={patchConfig}
              onPreviewSound={(key) => {
                if (studioAudioMonitor) handleTestSound(key);
              }}
            />
          ) : null}
        </div>

        {/* RIGHT COLUMN: Operator Configuration Tabs */}
        <div className="studio-col">
          <section className="studio-panel" aria-label="Broadcast configuration">
            <div className="studio-tabs" role="tablist" aria-label="Studio settings sections">
              {TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  className="studio-tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              id={`panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="studio-panel-body"
            >
              {!config ? (
                <div className="field-hint">Loading studio configuration...</div>
              ) : activeTab === 'source' ? (
                <MatchConnector
                  activeMatchKey={status?.activeMatchKey ?? null}
                  activeSourceUrl={status?.sourceUrl ?? null}
                  pollIntervalMs={config.pollIntervalMs}
                  onPatchConfig={patchConfig}
                />
              ) : activeTab === 'branding' ? (
                <BrandingPanel config={config} onPatchConfig={patchConfig} />
              ) : activeTab === 'tickers' ? (
                <TickerSubPanel config={config} onPatchConfig={patchConfig} />
              ) : (
                <AudioMixerPanel
                  config={config}
                  onPatchConfig={patchConfig}
                  onTestSound={handleTestSound}
                />
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Native <dialog> OBS Studio Setup Instructions */}
      <dialog ref={obsDialogRef} className="studio-dialog" aria-labelledby="obs-guide-title">
        <div className="studio-dialog-inner">
          <h2 id="obs-guide-title">Add Live Cricket Overlay to OBS Studio</h2>
          <ol>
            <li>
              In OBS Studio, click <strong>+</strong> under <strong>Sources</strong> and choose{' '}
              <strong>Browser</strong>.
            </li>
            <li>
              Paste URL: <code>{overlayUrl}</code>
            </li>
            <li>
              Set <strong>Width:</strong> <code>1920</code> and <strong>Height:</strong>{' '}
              <code>1080</code> (or <code>1280</code> × <code>720</code> — the overlay scales automatically).
            </li>
            <li>
              Check <strong>&ldquo;Control audio via OBS&rdquo;</strong> so automatic FOUR / SIX / WICKET sound
              effects appear as a dedicated track in your OBS Audio Mixer.
            </li>
            <li>
              Set FPS to <code>60</code> and click <strong>OK</strong>. Everything updates 100% automatically from
              Crex — no manual score editing needed.
            </li>
          </ol>
          <form method="dialog" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="submit" className="btn btn--primary">
              Close Guide
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
};
