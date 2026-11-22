import React from 'react';
import type { BatsmanState, BowlerState, MatchSnapshot } from '@shared/types';
import { PlayerAvatar } from './PlayerAvatar';

interface PlayersSectionProps {
  snapshot: MatchSnapshot;
}

const StrikerBatIcon: React.FC = () => (
  <svg
    className="ov-striker-bat"
    viewBox="0 0 64 64"
    role="img"
    aria-label="On strike"
  >
    <g transform="rotate(36 32 32)">
      {/* Bat Handle */}
      <rect x="28" y="4" width="8" height="17" rx="2.5" fill="#2b2d34" stroke="#f8fafc" strokeWidth="1.5" />
      <line x1="28" y1="9" x2="36" y2="9" stroke="#f59e0b" strokeWidth="1.5" />
      <line x1="28" y1="14" x2="36" y2="14" stroke="#f59e0b" strokeWidth="1.5" />
      {/* Bat Blade */}
      <path
        d="M22 21 H42 L43 56 C43 59 40 61 32 61 C24 61 21 59 21 56 Z"
        fill="#eab364"
        stroke="#925b1c"
        strokeWidth="2"
      />
      {/* Spine Ridge */}
      <path d="M32 22 V58" stroke="#f7d59c" strokeWidth="2.5" opacity="0.85" />
    </g>
  </svg>
);

const SpinningCricketBall: React.FC = () => (
  <div className="ov-bowler-ball-wrap" aria-hidden="true">
    <svg className="ov-bowler-ball-svg" viewBox="0 0 48 48">
      <defs>
        <radialGradient id="cricketBallGrad" cx="35%" cy="30%" r="68%">
          <stop offset="0%" stopColor="#ff4d4d" />
          <stop offset="55%" stopColor="#b80f18" />
          <stop offset="100%" stopColor="#4f050a" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="url(#cricketBallGrad)" stroke="#ff9e9e" strokeWidth="1.2" />
      <g className="ov-bowler-ball-seam">
        <path
          d="M11 8 C22 18, 26 30, 37 40"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeDasharray="3.2 2.4"
          strokeLinecap="round"
        />
        <path
          d="M14 6 C25 16, 29 28, 40 38"
          fill="none"
          stroke="#fde68a"
          strokeWidth="1.6"
          strokeDasharray="3.2 2.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  </div>
);

const BatsmanCard: React.FC<{
  batsman: BatsmanState | null;
  fallbackJersey: string;
}> = ({ batsman, fallbackJersey }) => {
  if (!batsman) {
    return (
      <div className="ov-player-col">
        <div className="ov-player-main">
          <PlayerAvatar
            playerKey="empty-bat"
            name="Batter"
            photoUrl="/api/proxy-image?kind=player&key=UNKNOWN"
            jerseyUrl={fallbackJersey}
          />
          <div className="ov-player-info">
            <div className="ov-player-name">WAITING...</div>
            <div className="ov-player-figures">0 (0)</div>
          </div>
        </div>
        <div className="ov-player-subbar">
          <span>4s:0</span>
          <span>6s:0</span>
          <span>SR:0.00</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`ov-player-col ${batsman.isOut ? 'ov-player-col--out' : ''}`}>
      <div className="ov-player-main">
        <PlayerAvatar
          playerKey={batsman.fkey}
          name={batsman.name}
          photoUrl={batsman.photoUrl}
          jerseyUrl={batsman.jerseyUrl}
          isOut={batsman.isOut}
        />
        <div className="ov-player-info">
          <div className="ov-player-name">{batsman.shortName}</div>
          <div className="ov-player-figures-row">
            <span className="ov-player-figures">
              {batsman.runs} ({batsman.balls})
            </span>
            {batsman.isOut ? (
              <span className="ov-out-pill" aria-label="Batsman out">
                OUT
              </span>
            ) : batsman.isStriker ? (
              <StrikerBatIcon />
            ) : null}
          </div>
        </div>
      </div>
      <div className="ov-player-subbar">
        <span>4s:{batsman.fours}</span>
        <span>6s:{batsman.sixes}</span>
        <span>SR:{batsman.strikeRate}</span>
      </div>
    </div>
  );
};

const BowlerCard: React.FC<{
  bowler: BowlerState | null;
  fallbackJersey: string;
}> = ({ bowler, fallbackJersey }) => {
  if (!bowler) {
    return (
      <div className="ov-player-col">
        <div className="ov-player-main">
          <PlayerAvatar
            playerKey="empty-bowl"
            name="Bowler"
            photoUrl="/api/proxy-image?kind=player&key=UNKNOWN"
            jerseyUrl={fallbackJersey}
          />
          <div className="ov-player-info">
            <div className="ov-player-name">BOWLER</div>
            <div className="ov-player-figures">0-0 (0.0)</div>
          </div>
        </div>
        <div className="ov-player-subbar">
          <span>Econ:0.00</span>
          <SpinningCricketBall />
        </div>
      </div>
    );
  }

  return (
    <div className="ov-player-col">
      <div className="ov-player-main">
        <PlayerAvatar
          playerKey={bowler.fkey}
          name={bowler.name}
          photoUrl={bowler.photoUrl}
          jerseyUrl={bowler.jerseyUrl}
        />
        <div className="ov-player-info">
          <div className="ov-player-name">{bowler.shortName}</div>
          <div className="ov-player-figures-row">
            <span className="ov-player-figures">
              {bowler.wickets}-{bowler.runsConceded} ({bowler.overs})
            </span>
          </div>
        </div>
      </div>
      <div className="ov-player-subbar">
        <span>Econ:{bowler.economy}</span>
        <SpinningCricketBall />
      </div>
    </div>
  );
};

export const PlayersSection: React.FC<PlayersSectionProps> = ({ snapshot }) => {
  return (
    <>
      <div className="ov-role-header">
        <span>BATSMAN</span>
        <span>BATSMAN</span>
        <span>BOWLER</span>
      </div>
      <section className="ov-players-row" aria-label="Current batsmen and bowler">
        <BatsmanCard batsman={snapshot.batsmen[0]} fallbackJersey={snapshot.leftTeam.jerseyUrl} />
        <BatsmanCard batsman={snapshot.batsmen[1]} fallbackJersey={snapshot.leftTeam.jerseyUrl} />
        <BowlerCard bowler={snapshot.bowler} fallbackJersey={snapshot.rightTeam.jerseyUrl} />
      </section>
    </>
  );
};
