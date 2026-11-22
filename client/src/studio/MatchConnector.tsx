import React, { useCallback, useEffect, useState } from 'react';
import type { CrexLiveMatchItem, StudioConfig } from '@shared/types';

interface MatchConnectorProps {
  activeMatchKey: string | null;
  activeSourceUrl: string | null;
  pollIntervalMs: number;
  onPatchConfig: (patch: Partial<StudioConfig>) => Promise<void>;
}

export const MatchConnector: React.FC<MatchConnectorProps> = ({
  activeMatchKey,
  activeSourceUrl,
  pollIntervalMs,
  onPatchConfig,
}) => {
  const [urlInput, setUrlInput] = useState(
    activeSourceUrl ||
      'https://crex.com/cricket-live-score/ind-vs-nz-1st-test-india-tour-of-new-zealand-2026-match-updates-12JM'
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [matches, setMatches] = useState<CrexLiveMatchItem[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'finished'>('all');

  useEffect(() => {
    if (activeSourceUrl) {
      setUrlInput(activeSourceUrl);
    }
  }, [activeSourceUrl]);

  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch('/api/crex/live-matches');
      if (res.ok) {
        const data = (await res.json()) as { matches?: CrexLiveMatchItem[] };
        setMatches(data.matches ?? []);
      }
    } catch {
      // keep existing list
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const attachUrl = async (targetUrl: string) => {
    const clean = targetUrl.trim();
    if (!clean) {
      setFeedback({ kind: 'error', text: 'Paste a Crex match URL or match key first.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/match/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      const body = (await res.json()) as {
        error?: string;
        snapshot?: { leftTeam: { shortName: string }; rightTeam: { shortName: string }; matchKey: string };
      };
      if (!res.ok) {
        setFeedback({ kind: 'error', text: body.error || 'Could not connect to that match.' });
      } else if (body.snapshot) {
        setUrlInput(clean);
        setFeedback({
          kind: 'ok',
          text: `Connected to ${body.snapshot.leftTeam.shortName} vs ${body.snapshot.rightTeam.shortName} (${body.snapshot.matchKey}). Polling live automatically.`,
        });
      }
    } catch {
      setFeedback({ kind: 'error', text: 'Network error communicating with local broadcast server.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void attachUrl(urlInput);
  };

  const visibleMatches =
    filter === 'all' ? matches : matches.filter((m) => m.status === filter);

  return (
    <div className="form-stack">
      <form className="form-stack" onSubmit={handleSubmit} aria-label="Connect Crex match URL">
        <div className="field">
          <label htmlFor="crex-url-input">
            Crex Match URL or Match Key <span aria-hidden="true">*</span>
          </label>
          <span id="crex-url-help" className="field-hint">
            Paste any <code>crex.com/cricket-live-score/...</code> link (live, <code>/match-details</code>, or{' '}
            <code>/match-scorecard</code>) or match key like <code>12JM</code>.
          </span>
          <input
            id="crex-url-input"
            name="crexUrl"
            type="text"
            required
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (feedback?.kind === 'error') setFeedback(null);
            }}
            aria-describedby="crex-url-help"
            aria-invalid={feedback?.kind === 'error' ? 'true' : undefined}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="https://crex.com/cricket-live-score/..."
          />
        </div>

        <div className="btn-group">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Connecting...' : 'Connect & Auto-Sync'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void fetch('/api/match/refresh', { method: 'POST' });
            }}
            disabled={!activeMatchKey}
          >
            Force Sync Now
          </button>
        </div>

        {feedback ? (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
            className={`status-banner ${feedback.kind === 'error' ? 'status-banner--error' : 'status-banner--ok'}`}
          >
            {feedback.text}
          </div>
        ) : null}
      </form>

      <div className="field">
        <label htmlFor="poll-interval-select">Live Polling Interval (ETag Cached)</label>
        <select
          id="poll-interval-select"
          name="pollIntervalMs"
          value={pollIntervalMs}
          onChange={(e) => void onPatchConfig({ pollIntervalMs: Number(e.target.value) })}
        >
          <option value={1500}>1.5 seconds (Ultra-fast)</option>
          <option value={2000}>2.0 seconds (Fast)</option>
          <option value={3000}>3.0 seconds (Recommended)</option>
          <option value={4000}>4.0 seconds (Crex Native)</option>
          <option value={6000}>6.0 seconds (Low Bandwidth)</option>
        </select>
      </div>

      <fieldset className="field-fieldset">
        <legend>Auto-Discovered Crex Matches ({matches.length})</legend>
        <div className="btn-group" style={{ justifyContent: 'space-between' }}>
          <div className="btn-group">
            {(['all', 'live', 'upcoming', 'finished'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`btn btn--sm ${filter === tab ? 'btn--active' : ''}`}
                onClick={() => setFilter(tab)}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void loadMatches()}
            disabled={loadingMatches}
          >
            {loadingMatches ? 'Loading...' : 'Refresh List'}
          </button>
        </div>

        <div className="match-list">
          {visibleMatches.length === 0 ? (
            <div className="field-hint">
              {loadingMatches ? 'Fetching matches from Crex...' : 'No matches found for this filter.'}
            </div>
          ) : (
            visibleMatches.map((m) => (
              <button
                key={m.matchKey}
                type="button"
                className={`match-item ${activeMatchKey === m.matchKey ? 'match-item--active' : ''}`}
                onClick={() => void attachUrl(m.crexUrl)}
                disabled={submitting}
              >
                <div className="match-item-top">
                  <span>
                    {m.team1Short} vs {m.team2Short} · {m.format}
                  </span>
                  <span className={`badge-tag badge-tag--${m.status}`}>{m.status}</span>
                </div>
                <div className="match-item-meta">
                  <span>
                    {m.score1 || m.team1Name} {m.score2 ? `| ${m.score2}` : ''}
                  </span>
                  <span>#{m.matchKey}</span>
                </div>
                <div className="field-hint">
                  {m.seriesName} — {m.statusText}
                </div>
              </button>
            ))
          )}
        </div>
      </fieldset>
    </div>
  );
};
