import React from 'react';
import type { BroadcastEvent, StudioConfig } from '@shared/types';

interface EventStingerProps {
  event: BroadcastEvent;
  promo: StudioConfig['stingerPromo'];
}

export const EventStinger: React.FC<EventStingerProps> = ({ event, promo }) => {
  const isWicket = event.type === 'WICKET';
  const isFour = event.type === 'FOUR';
  const isSix = event.type === 'SIX';

  const glowPrimary = isWicket
    ? 'rgba(255, 24, 96, 0.92)'
    : isFour
      ? 'rgba(0, 224, 255, 0.9)'
      : isSix
        ? 'rgba(255, 0, 204, 0.95)'
        : 'rgba(250, 204, 21, 0.92)';

  const glowSecondary = isWicket
    ? 'rgba(0, 212, 255, 0.78)'
    : isFour
      ? 'rgba(255, 0, 204, 0.82)'
      : 'rgba(0, 229, 255, 0.85)';

  const isCompactWord = event.title.length >= 7;

  return (
    <div
      key={event.id}
      className="ov-stinger"
      role="status"
      aria-live="assertive"
      style={
        {
          '--stinger-glow': glowPrimary,
          '--stinger-glow-2': glowSecondary,
        } as React.CSSProperties
      }
    >
      <div className="ov-stinger-frame-wrap">
        {/* Faithful Cyan-to-Magenta Glowing Asymmetrical Neon Trapezoid Frame */}
        <svg className="ov-stinger-svg" viewBox="0 0 1580 640" aria-hidden="true">
          <defs>
            <linearGradient id="neonCyanMagenta" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="48%" stopColor="#2ea6ff" />
              <stop offset="68%" stopColor="#d500f9" />
              <stop offset="100%" stopColor="#ff00aa" />
            </linearGradient>
            <filter id="neonBloom" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="16" result="blurBig" />
              <feGaussianBlur stdDeviation="5" result="blurTight" />
              <feMerge>
                <feMergeNode in="blurBig" />
                <feMergeNode in="blurTight" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Left-top cyan arm sweeping into open top split */}
          <path
            d="M 1180 78 L 110 38 L 210 568 L 470 554"
            fill="none"
            stroke="url(#neonCyanMagenta)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#neonBloom)"
          />
          {/* Right-bottom magenta arm sweeping from open top split */}
          <path
            d="M 1270 84 L 1470 96 L 1370 538 L 410 558"
            fill="none"
            stroke="url(#neonCyanMagenta)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#neonBloom)"
          />
          {/* Crisp white hot-core highlight inside neon tubes */}
          <path
            d="M 1180 78 L 110 38 L 210 568 L 470 554 M 1270 84 L 1470 96 L 1370 538 L 410 558"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        </svg>

        <div className={`ov-stinger-word ${isCompactWord ? 'ov-stinger-word--compact' : ''}`}>
          {event.title}
        </div>
        {event.subtitle ? <div className="ov-stinger-sub">{event.subtitle}</div> : null}
      </div>

      {promo.enabled ? (
        <div className="ov-stinger-promo">
          {promo.customImageUrl ? (
            <img
              src={promo.customImageUrl}
              alt={promo.brandLabel || 'Channel promotion'}
              className="ov-stinger-promo-img"
              width={1920}
              height={168}
            />
          ) : (
            <>
              <div className="ov-stinger-promo-brand">{promo.brandLabel}</div>
              <div className="ov-stinger-promo-copy">
                <div className="ov-stinger-promo-headline">{promo.headline}</div>
                {promo.subtext ? <div className="ov-stinger-promo-sub">{promo.subtext}</div> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};
