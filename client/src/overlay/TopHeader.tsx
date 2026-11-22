import React from 'react';
import type { MatchSnapshot } from '@shared/types';

interface TopHeaderProps {
  snapshot: MatchSnapshot;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ snapshot }) => {
  const { leftTeam, rightTeam, centerBadge } = snapshot;

  const badgeToneClass =
    centerBadge.tone === 'four'
      ? 'ov-center-box--four'
      : centerBadge.tone === 'six'
        ? 'ov-center-box--six'
        : centerBadge.tone === 'wicket'
          ? 'ov-center-box--wicket'
          : centerBadge.tone === 'extra'
            ? 'ov-center-box--extra'
            : '';

  const centerTextSizeClass =
    centerBadge.text.length >= 10
      ? 'ov-center-text--small'
      : centerBadge.text.length >= 6
        ? 'ov-center-text--medium'
        : '';

  const leftScoreCompact = leftTeam.score.length >= 9;
  const rightScoreCompact = rightTeam.score.length >= 9;

  return (
    <header className="ov-top-header" aria-label="Live match score header">
      {/* Left Side: Always the currently batting team (Red rounded badge) */}
      <div className="ov-team-side">
        <div className="ov-team-badge ov-team-badge--left">
          <img
            src={leftTeam.logoUrl}
            alt={`${leftTeam.name} logo`}
            width={150}
            height={150}
            fetchPriority="high"
          />
        </div>
        <div className="ov-team-text">
          <div className="ov-team-short">{leftTeam.shortName}</div>
          <div className="ov-team-score-row">
            <span className={`ov-team-score ${leftScoreCompact ? 'ov-team-score--compact' : ''}`}>
              {leftTeam.score}
            </span>
            {leftTeam.overs ? <span className="ov-team-overs">{leftTeam.overs}</span> : null}
          </div>
        </div>
      </div>

      {/* Center Status / Live Ball Event Box */}
      <div className={`ov-center-box ${badgeToneClass}`}>
        <div
          key={`${centerBadge.text}:${centerBadge.rawCode}`}
          className={`ov-center-text ${centerTextSizeClass}`}
        >
          {centerBadge.text}
        </div>
        {centerBadge.subtext ? <div className="ov-center-subtext">{centerBadge.subtext}</div> : null}
      </div>

      {/* Right Side: Always the bowling / defending team (Blue rounded badge) */}
      <div className="ov-team-side ov-team-side--right">
        <div className="ov-team-text">
          <div className="ov-team-short">{rightTeam.shortName}</div>
          <div className="ov-team-score-row">
            <span className={`ov-team-score ${rightScoreCompact ? 'ov-team-score--compact' : ''}`}>
              {rightTeam.score}
            </span>
            {rightTeam.overs ? <span className="ov-team-overs">{rightTeam.overs}</span> : null}
          </div>
        </div>
        <div className="ov-team-badge ov-team-badge--right">
          <img
            src={rightTeam.logoUrl}
            alt={`${rightTeam.name} logo`}
            width={150}
            height={150}
            fetchPriority="high"
          />
        </div>
      </div>
    </header>
  );
};
