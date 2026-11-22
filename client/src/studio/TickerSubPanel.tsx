import React, { useState } from 'react';
import type { StudioConfig } from '@shared/types';

interface TickerSubPanelProps {
  config: StudioConfig;
  onPatchConfig: (patch: Partial<StudioConfig>) => Promise<void>;
}

export const TickerSubPanel: React.FC<TickerSubPanelProps> = ({ config, onPatchConfig }) => {
  const [ytInput, setYtInput] = useState(config.subscriberWidget.youtubeHandle || '');
  const [ytBusy, setYtBusy] = useState(false);
  const [ytFeedback, setYtFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [subName, setSubName] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorAmount, setDonorAmount] = useState('');
  const [scHandle, setScHandle] = useState('');
  const [scAmount, setScAmount] = useState('');
  const [scColor, setScColor] = useState('#1fb6a6');
  const [iconError, setIconError] = useState<string | null>(null);

  const connectYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ytInput.trim();
    if (!clean) {
      setYtFeedback({ kind: 'error', text: 'Enter a YouTube handle like @Mythpat.' });
      return;
    }
    setYtBusy(true);
    setYtFeedback(null);
    try {
      const res = await fetch('/api/youtube/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: clean }),
      });
      const body = (await res.json()) as {
        error?: string;
        channel?: { title: string; handle: string; channelId: string };
        count?: number;
        provider?: string;
      };
      if (!res.ok || !body.channel) {
        setYtFeedback({ kind: 'error', text: body.error || 'Failed to connect channel.' });
      } else {
        setYtInput(body.channel.handle);
        setYtFeedback({
          kind: 'ok',
          text: `Live sync active for ${body.channel.title} (${(body.count ?? 0).toLocaleString('en-US')} subs via ${body.provider}). Updating automatically every 5s.`,
        });
      }
    } catch {
      setYtFeedback({ kind: 'error', text: 'Network error connecting YouTube channel.' });
    } finally {
      setYtBusy(false);
    }
  };

  const disconnectYoutube = async () => {
    setYtBusy(true);
    setYtFeedback(null);
    try {
      await fetch('/api/youtube/disconnect', { method: 'POST' });
      setYtFeedback({ kind: 'ok', text: 'Disconnected automatic YouTube subscriber sync.' });
    } finally {
      setYtBusy(false);
    }
  };

  const sendSubAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = subName.trim();
    if (!clean) return;
    await fetch('/api/alerts/subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriberName: clean, incrementCount: true }),
    });
    setSubName('');
  };

  const addDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName.trim() || !donorAmount.trim()) return;
    const nextEntries = [
      {
        id: `don_${Date.now()}`,
        donorName: donorName.trim().toUpperCase(),
        amountText: donorAmount.trim().toUpperCase(),
      },
      ...config.donationBar.entries,
    ];
    await onPatchConfig({
      donationBar: { ...config.donationBar, entries: nextEntries },
    });
    setDonorName('');
    setDonorAmount('');
  };

  const removeDonor = async (id: string) => {
    await onPatchConfig({
      donationBar: {
        ...config.donationBar,
        entries: config.donationBar.entries.filter((x) => x.id !== id),
      },
    });
  };

  const addSuperChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scHandle.trim() || !scAmount.trim()) return;
    const handle = scHandle.trim().startsWith('@') ? scHandle.trim() : `@${scHandle.trim()}`;
    const avatarText = handle.replace('@', '').slice(0, 1).toUpperCase() || 'S';
    const nextEntries = [
      {
        id: `sc_${Date.now()}`,
        handle,
        amountText: scAmount.trim().toUpperCase(),
        accentColor: scColor,
        avatarText,
      },
      ...config.superChatBar.entries,
    ];
    await onPatchConfig({
      superChatBar: { ...config.superChatBar, enabled: true, entries: nextEntries },
    });
    setScHandle('');
    setScAmount('');
  };

  const removeSuperChat = async (id: string) => {
    await onPatchConfig({
      superChatBar: {
        ...config.superChatBar,
        entries: config.superChatBar.entries.filter((x) => x.id !== id),
      },
    });
  };

  const uploadPayIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIconError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads/image', { method: 'POST', body: fd });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setIconError(data.error || 'Could not upload payment icon.');
      return;
    }
    await onPatchConfig({
      donationBar: { ...config.donationBar, providerIconUrl: data.url },
    });
  };

  return (
    <div className="form-stack">
      {/* 1. Subscriber Counter & Live Alert */}
      <fieldset className="field-fieldset">
        <legend>Live YouTube Subscriber Counter (Auto-Sync)</legend>

        <form onSubmit={(e) => void connectYoutube(e)} className="form-stack">
          <div className="field">
            <label htmlFor="yt-handle-input">YouTube Username / Handle, URL, or Channel ID</label>
            <span id="yt-handle-help" className="field-hint">
              Just enter a handle like <code>@Mythpat</code>, <code>@SKAdvise</code>, or paste the channel URL. No API key required — rolls the OBS odometer live every 5 seconds.
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id="yt-handle-input"
                type="text"
                value={ytInput}
                onChange={(e) => setYtInput(e.target.value)}
                aria-describedby="yt-handle-help"
                placeholder="@Mythpat"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                style={{ flex: 1, minWidth: '180px' }}
              />
              <button type="submit" className="btn btn--primary" disabled={ytBusy}>
                {ytBusy ? 'Syncing...' : 'Connect Live Subs'}
              </button>
              {config.subscriberWidget.youtubeSyncEnabled ? (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void disconnectYoutube()}
                  disabled={ytBusy}
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>

          {config.subscriberWidget.youtubeSyncEnabled && config.subscriberWidget.youtubeChannelId ? (
            <div className="status-banner status-banner--ok" role="status">
              <strong>LIVE SYNC:</strong> {config.subscriberWidget.youtubeChannelTitle || config.subscriberWidget.youtubeHandle}{' '}
              <code>{config.subscriberWidget.youtubeChannelId}</code> ·{' '}
              <strong>{config.subscriberWidget.count.toLocaleString('en-US')}</strong> subs
              {config.subscriberWidget.youtubeProvider ? ` (${config.subscriberWidget.youtubeProvider})` : ''}
            </div>
          ) : null}

          {ytFeedback && !(config.subscriberWidget.youtubeSyncEnabled && ytFeedback.kind === 'ok') ? (
            <div
              role={ytFeedback.kind === 'error' ? 'alert' : 'status'}
              className={`status-banner ${ytFeedback.kind === 'error' ? 'status-banner--error' : 'status-banner--ok'}`}
            >
              {ytFeedback.text}
            </div>
          ) : null}
        </form>

        <div className="radio-inline">
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.subscriberWidget.enabled}
              onChange={(e) =>
                void onPatchConfig({
                  subscriberWidget: { ...config.subscriberWidget, enabled: e.target.checked },
                })
              }
            />
            <span>Show Subscriber Counter</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.subscriberWidget.showSubscribeCta}
              onChange={(e) =>
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    showSubscribeCta: e.target.checked,
                  },
                })
              }
            />
            <span>Show Subscribe CTA Pill</span>
          </label>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="sub-label">Badge Pill Label</label>
            <input
              id="sub-label"
              type="text"
              maxLength={16}
              value={config.subscriberWidget.label}
              onChange={(e) =>
                void onPatchConfig({
                  subscriberWidget: { ...config.subscriberWidget, label: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="sub-count">Current Count (Auto or Manual)</label>
            <input
              id="sub-count"
              type="number"
              min={0}
              max={999999999}
              value={config.subscriberWidget.count}
              onChange={(e) =>
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    count: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                  },
                })
              }
            />
          </div>
        </div>

        <div className="btn-group">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              void onPatchConfig({
                subscriberWidget: {
                  ...config.subscriberWidget,
                  count: config.subscriberWidget.count + 1,
                },
              })
            }
          >
            +1 Sub
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              void onPatchConfig({
                subscriberWidget: {
                  ...config.subscriberWidget,
                  count: config.subscriberWidget.count + 10,
                },
              })
            }
          >
            +10 Subs
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              void onPatchConfig({
                subscriberWidget: {
                  ...config.subscriberWidget,
                  count: Math.max(0, config.subscriberWidget.count - 1),
                },
              })
            }
          >
            -1 Sub
          </button>
        </div>

        {/* Subscriber Goal Loading-Type Widget Settings (Replaces eSewa) */}
        <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="14" viewBox="0 0 24 17" fill="#ef4444" aria-hidden="true">
              <path d="M23.5 2.6a3 3 0 0 0-2.1-2.1C19.5 0 12 0 12 0S4.5 0 2.6.5A3 3 0 0 0 .5 2.6 31 31 0 0 0 0 8.5a31 31 0 0 0 .5 5.9 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 8.5a31 31 0 0 0-.5-5.9ZM9.6 12.1V4.9l6.3 3.6-6.3 3.6Z" />
            </svg>
            Subscriber Goal Loading Bar Settings (Replaces eSewa)
          </h4>
          <span className="field-hint" style={{ marginBottom: '12px', display: 'block' }}>
            Sets the target subscriber goal for your connected channel (e.g. <code>@Mythpat</code>). Renders as an animated broadcast loading progress bar on the overlay.
          </span>

          <div className="form-row">
            <div className="field">
              <label htmlFor="goal-target">Target Subscriber Goal</label>
              <input
                id="goal-target"
                type="number"
                min={1}
                max={999999999}
                value={config.subscriberWidget.goal || 18000000}
                onChange={(e) =>
                  void onPatchConfig({
                    subscriberWidget: {
                      ...config.subscriberWidget,
                      goal: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                    },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="goal-title">Goal Title / Badge</label>
              <input
                id="goal-title"
                type="text"
                maxLength={30}
                value={config.subscriberWidget.goalTitle || 'SUB GOAL'}
                onChange={(e) =>
                  void onPatchConfig({
                    subscriberWidget: {
                      ...config.subscriberWidget,
                      goalTitle: e.target.value,
                    },
                  })
                }
                placeholder="SUB GOAL or ROAD TO 18M"
              />
            </div>
          </div>

          <div className="btn-group" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    goal: 18000000,
                    goalTitle: 'ROAD TO 18M',
                  },
                })
              }
            >
              18M Goal
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    goal: 20000000,
                    goalTitle: 'ROAD TO 20M',
                  },
                })
              }
            >
              20M Goal
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                const next100k = Math.ceil((config.subscriberWidget.count + 1) / 100000) * 100000;
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    goal: next100k,
                    goalTitle: `NEXT ${(next100k / 1000).toFixed(0)}K`,
                  },
                });
              }}
            >
              Next 100K
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                const next1m = Math.ceil((config.subscriberWidget.count + 1) / 1000000) * 1000000;
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    goal: next1m,
                    goalTitle: `ROAD TO ${(next1m / 1000000).toFixed(0)}M`,
                  },
                });
              }}
            >
              Next 1M
            </button>
          </div>
        </div>

        <form onSubmit={(e) => void sendSubAlert(e)} className="form-stack">
          <div className="field">
            <label htmlFor="sub-alert-name">Trigger Live Subscriber Banner Alert (+1 &amp; Chime)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="sub-alert-name"
                type="text"
                maxLength={40}
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="e.g. SANJIB1993NP"
              />
              <button type="submit" className="btn btn--primary">
                Send Alert
              </button>
            </div>
          </div>
        </form>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#93c5fd' }}>
            Optional: Official YouTube Data API v3 Fallback Key
          </summary>
          <div className="field" style={{ marginTop: '10px' }}>
            <label htmlFor="yt-api-key">YouTube Data API v3 Key (Only used if live counters are unreachable)</label>
            <input
              id="yt-api-key"
              type="password"
              value={config.subscriberWidget.youtubeApiKey}
              onChange={(e) =>
                void onPatchConfig({
                  subscriberWidget: {
                    ...config.subscriberWidget,
                    youtubeApiKey: e.target.value,
                  },
                })
              }
              placeholder="AIza..."
              autoComplete="off"
            />
          </div>
        </details>
      </fieldset>

      {/* 2. Donation / eSewa Bar */}
      <fieldset className="field-fieldset">
        <legend>Donation / eSewa / Sponsor Bar (Middle Right)</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.donationBar.enabled}
            onChange={(e) =>
              void onPatchConfig({
                donationBar: { ...config.donationBar, enabled: e.target.checked },
              })
            }
          />
          <span>Show Donation / Payment Strip</span>
        </label>

        <div className="form-row">
          <div className="field">
            <label htmlFor="pay-account">Phone / Payment ID</label>
            <input
              id="pay-account"
              type="text"
              maxLength={40}
              value={config.donationBar.accountNumber}
              onChange={(e) =>
                void onPatchConfig({
                  donationBar: { ...config.donationBar, accountNumber: e.target.value },
                })
              }
            />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="pay-badge">Badge</label>
              <input
                id="pay-badge"
                type="text"
                maxLength={4}
                value={config.donationBar.providerBadgeText}
                onChange={(e) =>
                  void onPatchConfig({
                    donationBar: { ...config.donationBar, providerBadgeText: e.target.value },
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="pay-color">Color</label>
              <input
                id="pay-color"
                type="color"
                value={config.donationBar.providerColor}
                onChange={(e) =>
                  void onPatchConfig({
                    donationBar: { ...config.donationBar, providerColor: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="pay-icon-upload">Or Upload Payment Icon (eSewa / Khalti / UPI)</label>
          <input
            id="pay-icon-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void uploadPayIcon(e)}
          />
          {iconError ? (
            <span role="alert" className="status-banner status-banner--error">
              {iconError}
            </span>
          ) : null}
        </div>

        <form onSubmit={(e) => void addDonor(e)} className="form-row">
          <div className="field">
            <label htmlFor="donor-name">Donor Name</label>
            <input
              id="donor-name"
              type="text"
              maxLength={60}
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder="YAM NEPALI"
            />
          </div>
          <div className="field">
            <label htmlFor="donor-amount">Amount</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="donor-amount"
                type="text"
                maxLength={32}
                value={donorAmount}
                onChange={(e) => setDonorAmount(e.target.value)}
                placeholder="RS 250"
              />
              <button type="submit" className="btn btn--primary">
                Add
              </button>
            </div>
          </div>
        </form>

        <div className="entry-list">
          {config.donationBar.entries.map((entry) => (
            <div key={entry.id} className="entry-row">
              <span>
                <strong>{entry.donorName}</strong> · {entry.amountText}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => void removeDonor(entry.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      {/* 3. Bottom Yet-To-Bat Ticker & Super Chat Pill */}
      <fieldset className="field-fieldset">
        <legend>Bottom Ticker &amp; Super Chat Highlight</legend>
        <div className="radio-inline">
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.showBottomTicker}
              onChange={(e) => void onPatchConfig({ showBottomTicker: e.target.checked })}
            />
            <span>Show Bottom Marquee Ticker</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.superChatBar.enabled}
              onChange={(e) =>
                void onPatchConfig({
                  superChatBar: { ...config.superChatBar, enabled: e.target.checked },
                })
              }
            />
            <span>Show Left Super Chat Pill</span>
          </label>
        </div>

        <form onSubmit={(e) => void addSuperChat(e)} className="form-stack">
          <div className="form-row">
            <div className="field">
              <label htmlFor="sc-handle">Viewer Handle</label>
              <input
                id="sc-handle"
                type="text"
                value={scHandle}
                onChange={(e) => setScHandle(e.target.value)}
                placeholder="@viewername"
              />
            </div>
            <div className="field">
              <label htmlFor="sc-amount">Amount &amp; Tier Color</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="sc-amount"
                  type="text"
                  value={scAmount}
                  onChange={(e) => setScAmount(e.target.value)}
                  placeholder="RS 500"
                />
                <input
                  type="color"
                  aria-label="Super Chat tier color"
                  value={scColor}
                  onChange={(e) => setScColor(e.target.value)}
                />
                <button type="submit" className="btn btn--primary">
                  Add
                </button>
              </div>
            </div>
          </div>
        </form>

        {config.superChatBar.entries.length > 0 ? (
          <div className="entry-list">
            {config.superChatBar.entries.map((entry) => (
              <div key={entry.id} className="entry-row">
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: entry.accentColor,
                      marginRight: '8px',
                    }}
                  />
                  <strong>{entry.handle}</strong> · {entry.amountText}
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => void removeSuperChat(entry.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </fieldset>
    </div>
  );
};
