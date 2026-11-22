import React, { useEffect, useRef, useState } from 'react';
import type { BroadcastEvent } from '@shared/types';
import { useBroadcastSocket, type SubAlertMessage } from '../hooks/useBroadcastSocket';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { BottomTicker } from './BottomTicker';
import { CutawayCards } from './CutawayCards';
import { EventStinger } from './EventStinger';
import { MiddleSection } from './MiddleSection';
import { OversTimeline } from './OversTimeline';
import { PlayersSection } from './PlayersSection';
import { StatusStrip } from './StatusStrip';
import { TopHeader } from './TopHeader';
import '../styles/overlay.css';

export const OverlayApp: React.FC = () => {
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  const { snapshot, config, latestEvent, latestSubAlert } = useBroadcastSocket();
  const { playSound } = useSoundEngine(config, isPreview);

  const [scale, setScale] = useState(1);
  const [activeStinger, setActiveStinger] = useState<BroadcastEvent | null>(null);
  const [visibleSubAlert, setVisibleSubAlert] = useState<SubAlertMessage | null>(null);

  const lastHandledEventIdRef = useRef<string | null>(null);
  const lastHandledSubIdRef = useRef<string | null>(null);
  const stingerTimerRef = useRef<number | null>(null);
  const subTimerRef = useRef<number | null>(null);

  // Set page title for OBS / tab clarity
  useEffect(() => {
    document.title = snapshot
      ? `${snapshot.leftTeam.shortName} vs ${snapshot.rightTeam.shortName} | OBS Broadcast Overlay`
      : 'OBS Cricket Broadcast Overlay';
  }, [snapshot]);

  // Scale locked 1920x1080 broadcast canvas cleanly into any viewport (720p, 1080p, preview iframe)
  useEffect(() => {
    const computeScale = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setScale(s > 0 ? s : 1);
    };
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, []);

  // Handle incoming real-time Broadcast Events (SFX + Full-Screen Neon Stinger)
  useEffect(() => {
    if (!latestEvent || latestEvent.id === lastHandledEventIdRef.current) return;
    lastHandledEventIdRef.current = latestEvent.id;

    // Trigger broadcast SFX immediately
    void playSound(latestEvent.soundKey);

    // Show full-screen FOUR / SIX / WICKET / MILESTONE stinger takeover
    if (latestEvent.showFullScreenStinger) {
      if (stingerTimerRef.current !== null) {
        window.clearTimeout(stingerTimerRef.current);
      }
      setActiveStinger(latestEvent);
      stingerTimerRef.current = window.setTimeout(() => {
        setActiveStinger(null);
        stingerTimerRef.current = null;
      }, latestEvent.durationMs);
    }
  }, [latestEvent, playSound]);

  // Handle incoming live subscriber alerts
  useEffect(() => {
    if (!latestSubAlert || latestSubAlert.id === lastHandledSubIdRef.current) return;
    lastHandledSubIdRef.current = latestSubAlert.id;
    if (subTimerRef.current !== null) {
      window.clearTimeout(subTimerRef.current);
    }
    setVisibleSubAlert(latestSubAlert);
    subTimerRef.current = window.setTimeout(() => {
      setVisibleSubAlert(null);
      subTimerRef.current = null;
    }, 6500);
  }, [latestSubAlert]);

  useEffect(() => {
    return () => {
      if (stingerTimerRef.current !== null) window.clearTimeout(stingerTimerRef.current);
      if (subTimerRef.current !== null) window.clearTimeout(subTimerRef.current);
    };
  }, []);

  const viewMode = config?.overlayViewMode ?? 'live';

  return (
    <main className="overlay-viewport">
      <div
        className="overlay-stage"
        style={{ transform: `scale(${scale})` }}
      >
        {!snapshot || !config ? (
          <div className="overlay-empty">
            <div className="overlay-empty-title">CREX OBS BROADCAST OVERLAY READY</div>
            <div className="overlay-empty-sub">
              Open the Control Studio at <code>http://localhost:3000/</code> and paste any{' '}
              <code>crex.com</code> match URL (or pick a live match) to begin automatic streaming.
            </div>
          </div>
        ) : (
          <>
            <TopHeader snapshot={snapshot} />

            {viewMode === 'live' ? (
              <>
                <StatusStrip snapshot={snapshot} />
                <OversTimeline snapshot={snapshot} brandBlock={config.brandBlock} />
                <MiddleSection
                  snapshot={snapshot}
                  config={config}
                />
                <PlayersSection snapshot={snapshot} />
                {config.showBottomTicker ? (
                  <BottomTicker snapshot={snapshot} superChatBar={config.superChatBar} />
                ) : null}
              </>
            ) : (
              <CutawayCards mode={viewMode} snapshot={snapshot} />
            )}

            {activeStinger ? (
              <EventStinger event={activeStinger} promo={config.stingerPromo} />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
};
