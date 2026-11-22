import React, { useEffect, useState } from 'react';
import type { MatchSnapshot, StudioConfig } from '@shared/types';

interface BottomTickerProps {
  snapshot: MatchSnapshot;
  superChatBar: StudioConfig['superChatBar'];
}

export const BottomTicker: React.FC<BottomTickerProps> = ({ snapshot, superChatBar }) => {
  const [scIdx, setScIdx] = useState(0);
  const entries = superChatBar.entries;

  useEffect(() => {
    if (!superChatBar.enabled || entries.length <= 1) {
      setScIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setScIdx((prev) => (prev + 1) % entries.length);
    }, Math.max(2000, superChatBar.rotateIntervalMs));
    return () => window.clearInterval(timer);
  }, [entries.length, superChatBar.enabled, superChatBar.rotateIntervalMs]);

  const currentSc = entries[scIdx % Math.max(1, entries.length)] ?? null;

  const yetToBatText =
    snapshot.yetToBat.length > 0
      ? snapshot.yetToBat
          .map((p) => (p.average && p.average !== '--' ? `${p.shortName} (Avg. ${p.average})` : p.shortName))
          .join('  —  ')
      : snapshot.latestCommentary ||
        `${snapshot.matchInfo.seriesName.toUpperCase()} · ${snapshot.matchInfo.venue.toUpperCase()}`;

  const label = snapshot.yetToBat.length > 0 ? 'YET TO BAT PLAYERS:' : 'LIVE UPDATE:';

  return (
    <footer className="ov-bottom-ticker" aria-label="Yet to bat ticker">
      {superChatBar.enabled && currentSc ? (
        <div
          key={currentSc.id}
          className="ov-superchat-pill"
          style={{ backgroundColor: currentSc.accentColor }}
        >
          <span className="ov-sc-avatar">{currentSc.avatarText}</span>
          <span className="ov-sc-handle">{currentSc.handle}</span>
          <span className="ov-sc-amount">{currentSc.amountText}</span>
        </div>
      ) : null}

      <div className={`ov-marquee-wrap ${snapshot.chase.isChasing ? 'ov-marquee-wrap--chase' : ''}`}>
        <div className="ov-marquee-track">
          <span className="ov-marquee-chunk">
            <span className="ov-marquee-label">{label}</span>
            <span>{yetToBatText}</span>
          </span>
          <span className="ov-marquee-chunk" aria-hidden="true">
            <span className="ov-marquee-label">{label}</span>
            <span>{yetToBatText}</span>
          </span>
        </div>
      </div>
    </footer>
  );
};
