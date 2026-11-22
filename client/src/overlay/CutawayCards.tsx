import React from 'react';
import type { MatchSnapshot, OverlayViewMode, PlayingXIPlayer } from '@shared/types';
import { PlayerAvatar } from './PlayerAvatar';

interface CutawayCardsProps {
  mode: Exclude<OverlayViewMode, 'live'>;
  snapshot: MatchSnapshot;
}

const PlayingXiGrid: React.FC<{
  teamName: string;
  teamLogo: string;
  players: PlayingXIPlayer[];
}> = ({ teamName, teamLogo, players }) => {
  const topRow = players.slice(0, 6);
  const bottomRow = players.slice(6, 11);

  return (
    <section className="ov-cutaway" aria-label={`${teamName} Playing XI`}>
      <div className="ov-cutaway-banner ov-cutaway-banner--magenta">
        <img src={teamLogo} alt="" className="ov-cutaway-logo" width={58} height={58} />
        <div className="ov-cutaway-title">{teamName} XI</div>
        <img src={teamLogo} alt="" className="ov-cutaway-logo" width={58} height={58} />
      </div>

      {players.length === 0 ? (
        <div className="overlay-empty">
          <div className="overlay-empty-sub">Playing XI not published yet by Crex for this match.</div>
        </div>
      ) : (
        <div className="ov-xi-container">
          {[topRow, bottomRow].map((row, rIdx) => (
            <div key={`xi-row-${rIdx}`} className="ov-xi-row">
              {row.map((player) => (
                <div key={player.fkey} className="ov-xi-card">
                  <div className="ov-xi-photo-box">
                    <div className="ov-xi-tags">
                      {player.isCaptain ? <span className="ov-xi-tag">[C]</span> : null}
                      {player.isWk ? <span className="ov-xi-tag">[WK]</span> : null}
                      {player.isOverseas ? (
                        <span className="ov-xi-tag ov-xi-tag--overseas" title="Overseas player">
                          ✈
                        </span>
                      ) : null}
                    </div>
                    <PlayerAvatar
                      playerKey={player.fkey}
                      name={player.name}
                      photoUrl={player.photoUrl}
                      jerseyUrl={player.jerseyUrl}
                    />
                  </div>
                  <div className="ov-xi-nameplate">{player.shortName}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export const CutawayCards: React.FC<CutawayCardsProps> = ({ mode, snapshot }) => {
  if (mode === 'bowling-card') {
    const scorecard = snapshot.currentInningsScorecard;
    const bowlers = scorecard?.bowlers ?? [];

    return (
      <section className="ov-cutaway" aria-label="Bowling Summary">
        <div className="ov-cutaway-banner">
          <div className="ov-cutaway-title-group">
            <img
              src={snapshot.rightTeam.logoUrl}
              alt=""
              className="ov-cutaway-logo"
              width={58}
              height={58}
            />
            <span className="ov-cutaway-title">{snapshot.rightTeam.name}</span>
            <span className="ov-cutaway-pill">BOWLING</span>
          </div>
          <div className="ov-cutaway-score-summary">
            {snapshot.leftTeam.shortName} {snapshot.leftTeam.score} {snapshot.leftTeam.overs}
          </div>
        </div>

        <div className="ov-table-wrap">
          {bowlers.length === 0 ? (
            <div className="overlay-empty">
              <div className="overlay-empty-sub">No bowling figures available yet in this innings.</div>
            </div>
          ) : (
            <table className="ov-broadcast-table">
              <thead>
                <tr>
                  <th scope="col">BOWLER</th>
                  <th scope="col">O</th>
                  <th scope="col">M</th>
                  <th scope="col">R</th>
                  <th scope="col">W</th>
                  <th scope="col">ECON</th>
                </tr>
              </thead>
              <tbody>
                {bowlers.slice(0, 7).map((b) => (
                  <tr key={b.fkey}>
                    <td>
                      <div className="ov-bowler-cell">
                        <div className="ov-mini-avatar">
                          <img src={b.photoUrl} alt="" width={60} height={60} />
                        </div>
                        <span>{b.name}</span>
                        {b.isBest ? <span className="ov-best-pill">BEST</span> : null}
                      </div>
                    </td>
                    <td>{b.overs}</td>
                    <td>{b.maidens}</td>
                    <td>{b.runs}</td>
                    <td>
                      {b.wickets > 0 ? (
                        <span className="ov-wkt-badge">{b.wickets}</span>
                      ) : (
                        <span>0</span>
                      )}
                    </td>
                    <td>{b.economy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    );
  }

  if (mode === 'batting-card') {
    const scorecard = snapshot.currentInningsScorecard;
    const batters = scorecard?.batters ?? [];

    return (
      <section className="ov-cutaway" aria-label="Batting Scorecard">
        <div className="ov-cutaway-banner">
          <div className="ov-cutaway-title-group">
            <img
              src={snapshot.leftTeam.logoUrl}
              alt=""
              className="ov-cutaway-logo"
              width={58}
              height={58}
            />
            <span className="ov-cutaway-title">{snapshot.leftTeam.name}</span>
            <span className="ov-cutaway-pill">BATTING</span>
          </div>
          <div className="ov-cutaway-score-summary">
            EXTRAS: {scorecard?.extras ?? '0'}
          </div>
        </div>

        <div className="ov-table-wrap">
          {batters.length === 0 ? (
            <div className="overlay-empty">
              <div className="overlay-empty-sub">No batting scorecard entries yet in this innings.</div>
            </div>
          ) : (
            <table className="ov-broadcast-table ov-broadcast-table--compact">
              <thead>
                <tr>
                  <th scope="col">BATTER</th>
                  <th scope="col">STATUS</th>
                  <th scope="col">R</th>
                  <th scope="col">B</th>
                  <th scope="col">4s</th>
                  <th scope="col">6s</th>
                  <th scope="col">SR</th>
                </tr>
              </thead>
              <tbody>
                {batters.slice(0, 11).map((bat) => (
                  <tr key={bat.fkey}>
                    <td>
                      {bat.name}
                      {bat.isCaptain ? ' (C)' : ''}
                      {bat.isWk ? ' (WK)' : ''}
                      {bat.isNotOut ? ' *' : ''}
                    </td>
                    <td style={{ color: bat.isNotOut ? '#4ade80' : '#94a3b8', fontSize: '22px' }}>
                      {bat.dismissal}
                    </td>
                    <td style={{ color: '#facc15' }}>{bat.runs}</td>
                    <td>{bat.balls}</td>
                    <td>{bat.fours}</td>
                    <td>{bat.sixes}</td>
                    <td>{bat.strikeRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    );
  }

  if (mode === 'playing-xi-left') {
    return (
      <PlayingXiGrid
        teamName={snapshot.leftTeam.name}
        teamLogo={snapshot.leftTeam.logoUrl}
        players={snapshot.playingXI.left}
      />
    );
  }

  if (mode === 'playing-xi-right') {
    return (
      <PlayingXiGrid
        teamName={snapshot.rightTeam.name}
        teamLogo={snapshot.rightTeam.logoUrl}
        players={snapshot.playingXI.right}
      />
    );
  }

  // Match Info & Weather Card
  const { matchInfo, formatLabel, testInfo } = snapshot;
  return (
    <section className="ov-cutaway" aria-label="Match info and weather">
      <div className="ov-cutaway-banner ov-cutaway-banner--magenta">
        <img src={snapshot.leftTeam.logoUrl} alt="" className="ov-cutaway-logo" width={58} height={58} />
        <div className="ov-cutaway-title">MATCH INFO &amp; CONDITIONS</div>
        <img src={snapshot.rightTeam.logoUrl} alt="" className="ov-cutaway-logo" width={58} height={58} />
      </div>

      <div className="ov-info-grid">
        <div className="ov-info-box">
          <div className="ov-info-heading">MATCH DETAILS</div>
          <div className="ov-info-item">
            <span>SERIES</span>
            <span>{matchInfo.seriesName}</span>
          </div>
          <div className="ov-info-item">
            <span>FORMAT</span>
            <span>{formatLabel}</span>
          </div>
          <div className="ov-info-item">
            <span>VENUE</span>
            <span>{matchInfo.venue || 'TBA'}</span>
          </div>
          <div className="ov-info-item">
            <span>TOSS</span>
            <span>{matchInfo.tossText || 'Pending'}</span>
          </div>
          {testInfo.day ? (
            <div className="ov-info-item">
              <span>TEST STATUS</span>
              <span>
                Day {testInfo.day}
                {testInfo.session ? ` · Session ${testInfo.session}` : ''}
                {testInfo.oversLeftToday ? ` · ${testInfo.oversLeftToday} Ov left` : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div className="ov-info-box">
          <div className="ov-info-heading">LIVE WEATHER</div>
          <div className="ov-info-item">
            <span>TEMPERATURE</span>
            <span>{matchInfo.weatherTemp || '--'}</span>
          </div>
          <div className="ov-info-item">
            <span>CONDITIONS</span>
            <span>{matchInfo.weatherCondition || '--'}</span>
          </div>
          <div className="ov-info-item">
            <span>HUMIDITY</span>
            <span>{matchInfo.weatherHumidity || '--'}</span>
          </div>
          <div className="ov-info-item">
            <span>RAIN CHANCE</span>
            <span>{matchInfo.weatherRainChance || '--'}</span>
          </div>
          <div className="ov-info-item">
            <span>WIND</span>
            <span>{matchInfo.weatherWind || '--'}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
