import React from 'react';
import type { MatchSnapshot, StudioConfig } from '@shared/types';

interface OversTimelineProps {
  snapshot: MatchSnapshot;
  brandBlock: StudioConfig['brandBlock'];
}

export const OversTimeline: React.FC<OversTimelineProps> = ({ snapshot, brandBlock }) => {
  const overs = snapshot.recentOvers;

  return (
    <div className="ov-overs-strip">
      <div className="ov-overs-track">
        {overs.length === 0 ? (
          <span className="ov-over-label">
            {snapshot.status === 'upcoming'
              ? `${snapshot.matchInfo.seriesName.toUpperCase()} · ${snapshot.matchInfo.venue.toUpperCase()}`
              : 'WAITING FOR FIRST DELIVERY...'}
          </span>
        ) : (
          overs.map((over) => (
            <div key={`over-${over.overNumber}`} className="ov-over-group">
              <span className="ov-over-label">OVER {over.overNumber}:</span>
              <div className="ov-ball-list">
                {over.balls.map((ball, idx) => {
                  const isLong = ball.display.length >= 3;
                  return (
                    <span
                      key={`b-${over.overNumber}-${idx}`}
                      className={[
                        'ov-ball',
                        `ov-ball--${ball.kind}`,
                        isLong ? 'ov-ball--long' : '',
                        ball.isLatest ? 'ov-ball--latest' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {ball.display}
                    </span>
                  );
                })}
              </div>
              <span className="ov-over-total">= {over.totalRuns}</span>
            </div>
          ))
        )}
      </div>

      {/* Right Channel Brand Block */}
      <div
        className="ov-brand-block"
        style={{ '--brand-bg': brandBlock.bgColor } as React.CSSProperties}
      >
        {brandBlock.mode === 'custom-image' && brandBlock.customImageUrl ? (
          <img
            src={brandBlock.customImageUrl}
            alt={`${brandBlock.titleLine1} ${brandBlock.titleLine2}`}
            className="ov-brand-img"
            width={412}
            height={76}
          />
        ) : (
          <>
            {brandBlock.monogram ? (
              <span className="ov-brand-monogram">{brandBlock.monogram}</span>
            ) : null}
            <div className="ov-brand-lines">
              <span className="ov-brand-line1">{brandBlock.titleLine1}</span>
              <span className="ov-brand-line2">{brandBlock.titleLine2}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
