import React from 'react';
import type {
  BroadcastEvent,
  OverlayViewMode,
  SoundEventKey,
  StudioConfig,
} from '@shared/types';

interface DirectorDeckProps {
  config: StudioConfig;
  simulatorRunning: boolean;
  recentEvents: BroadcastEvent[];
  onPatchConfig: (patch: Partial<StudioConfig>) => Promise<void>;
  onPreviewSound: (key: SoundEventKey) => void;
}

const VIEW_MODES: Array<{ id: OverlayViewMode; label: string }> = [
  { id: 'live', label: 'Live Scoreboard' },
  { id: 'bowling-card', label: 'Bowling Card' },
  { id: 'batting-card', label: 'Batting Card' },
  { id: 'playing-xi-left', label: 'Batting XI' },
  { id: 'playing-xi-right', label: 'Bowling XI' },
  { id: 'match-info', label: 'Match Info' },
];

export const DirectorDeck: React.FC<DirectorDeckProps> = ({
  config,
  simulatorRunning,
  recentEvents,
  onPatchConfig,
  onPreviewSound,
}) => {
  const triggerEvent = async (
    type: 'FOUR' | 'SIX' | 'WICKET' | 'OVER' | 'MILESTONE_50' | 'MILESTONE_100',
    soundKey: SoundEventKey
  ) => {
    onPreviewSound(soundKey);
    await fetch('/api/events/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  };

  const stepSim = async (outcome: 'BALL' | '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'WD' | 'NB') => {
    await fetch('/api/simulator/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    });
  };

  const toggleAutoSim = async () => {
    await fetch('/api/simulator/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !simulatorRunning }),
    });
  };

  return (
    <section className="studio-panel" aria-labelledby="director-heading">
      <div className="studio-panel-header">
        <h2 id="director-heading">Broadcast Director Deck</h2>
        <button
          type="button"
          className={`btn btn--sm ${simulatorRunning ? 'btn--danger' : 'btn--success'}`}
          onClick={() => void toggleAutoSim()}
        >
          {simulatorRunning ? 'Stop Auto-Simulator' : 'Run Match Simulator'}
        </button>
      </div>

      <div className="studio-panel-body">
        {/* Cutaway View Switcher */}
        <fieldset className="field-fieldset">
          <legend>Active Overlay View (Instant Cutaway)</legend>
          <div className="btn-group">
            {VIEW_MODES.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`btn btn--sm ${config.overlayViewMode === v.id ? 'btn--active' : ''}`}
                aria-pressed={config.overlayViewMode === v.id}
                onClick={() => void onPatchConfig({ overlayViewMode: v.id })}
              >
                {v.label}
              </button>
            ))}
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.autoBowlingCardOnOver}
              onChange={(e) => void onPatchConfig({ autoBowlingCardOnOver: e.target.checked })}
            />
            <span>
              Auto-show Bowling Summary Card on Over Break ({Math.round(config.autoBowlingCardDurationMs / 1000)}s)
            </span>
          </label>
        </fieldset>

        {/* Manual Stinger & SFX Triggers */}
        <fieldset className="field-fieldset">
          <legend>Instant Stinger + SFX Triggers (Live OBS + Audio)</legend>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn--success"
              onClick={() => void triggerEvent('FOUR', 'four')}
            >
              FOUR (4)
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void triggerEvent('SIX', 'six')}
            >
              SIX (6)
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void triggerEvent('WICKET', 'wicket')}
            >
              WICKET (W)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void triggerEvent('OVER', 'over')}
            >
              OVER Chime
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void triggerEvent('MILESTONE_50', 'milestone')}
            >
              FIFTY (50)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void triggerEvent('MILESTONE_100', 'milestone')}
            >
              CENTURY (100)
            </button>
          </div>
        </fieldset>

        {/* Ball-by-Ball Live Simulator Stepper */}
        <fieldset className="field-fieldset">
          <legend>Step-by-Step Ball Simulator (Test Full Dynamic Scoreboard)</legend>
          <div className="btn-group">
            {(['BALL', '0', '1', '2', '3', '4', '6', 'W', 'WD', 'NB'] as const).map((ball) => (
              <button
                key={ball}
                type="button"
                className={`btn btn--sm ${
                  ball === 'W' ? 'btn--danger' : ball === '4' ? 'btn--success' : ball === '6' ? 'btn--primary' : ''
                }`}
                onClick={() => void stepSim(ball)}
              >
                {ball}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Recent Event Log */}
        <div className="field">
          <label htmlFor="recent-events-region">Recent Broadcast Events</label>
          <div id="recent-events-region" className="event-log" role="log" aria-live="polite">
            {recentEvents.length === 0 ? (
              <div className="field-hint">No broadcast events fired yet.</div>
            ) : (
              recentEvents.slice(0, 8).map((evt) => (
                <div key={evt.id} className="event-log-row">
                  <span>
                    <strong>{evt.type}</strong>
                    {evt.subtitle ? ` — ${evt.subtitle}` : ''}
                  </span>
                  <span style={{ color: '#94a3b8' }}>
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
