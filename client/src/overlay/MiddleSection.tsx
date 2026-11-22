import React, { useEffect, useState } from 'react';
import type { MatchSnapshot, StudioConfig } from '@shared/types';
import type { SubAlertMessage } from '../hooks/useBroadcastSocket';
import { PlayerAvatar } from './PlayerAvatar';

interface MiddleSectionProps {
  snapshot: MatchSnapshot;
  config: StudioConfig;
  activeSubAlert: SubAlertMessage | null;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const OdometerNumber: React.FC<{ value: number }> = ({ value }) => {
  const formatted = Math.max(0, Math.floor(value)).toLocaleString('en-US');
  return (
    <span className="ov-odometer" aria-label={formatted}>
      {formatted.split('').map((ch, idx) => {
        if (ch >= '0' && ch <= '9') {
          const digit = Number(ch);
          return (
            <span key={`slot-${formatted.length - idx}`} className="ov-odo-slot">
              <span
                className="ov-odo-strip"
                style={{ transform: `translateY(-${digit * 1.05}em)` }}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="ov-odo-digit">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          );
        }
        return (
          <span key={`sep-${idx}`} className="ov-odo-sep">
            {ch}
          </span>
        );
      })}
    </span>
  );
};

const VsLightningEmblem: React.FC = () => (
  <svg
    className="ov-vs-bolt"
    viewBox="0 0 180 160"
    aria-hidden="true"
  >
    {/* White jagged lightning bolt outline */}
    <path
      d="M112 4 L62 66 L88 66 L54 156 L124 84 L96 84 Z"
      fill="#0d1117"
      stroke="#ffffff"
      strokeWidth="6"
      strokeLinejoin="round"
    />
    {/* Bold V */}
    <path
      d="M22 44 L48 44 L60 88 L74 44 L98 44 L72 114 L46 114 Z"
      fill="#dc141c"
      stroke="#ffffff"
      strokeWidth="5"
      strokeLinejoin="round"
    />
    {/* Bold S */}
    <path
      d="M154 54 C146 46 130 44 118 48 C105 52 99 61 101 72 C103 82 114 86 128 89 C139 91 142 94 140 99 C138 105 124 106 106 100 L98 115 C116 122 146 122 156 107 C164 95 161 80 144 74 C131 70 124 69 125 64 C126 60 137 59 148 65 Z"
      fill="#dc141c"
      stroke="#ffffff"
      strokeWidth="5"
      strokeLinejoin="round"
    />
  </svg>
);

export const MiddleSection: React.FC<MiddleSectionProps> = ({
  snapshot,
  config,
  activeSubAlert,
}) => {
  const { winProbability, lastWicket, partnership, leftTeam, rightTeam } = snapshot;
  const { subscriberWidget, vsBanner, donationBar } = config;

  const [donorIdx, setDonorIdx] = useState(0);
  const donors = donationBar.entries;

  useEffect(() => {
    if (donors.length <= 1) {
      setDonorIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setDonorIdx((prev) => (prev + 1) % donors.length);
    }, Math.max(2000, donationBar.rotateIntervalMs));
    return () => window.clearInterval(timer);
  }, [donors.length, donationBar.rotateIntervalMs]);

  const currentDonor = donors[donorIdx % Math.max(1, donors.length)] ?? null;
  const lastWicketLabel = lastWicket.available
    ? `LAST Wkt: ${lastWicket.formatted}`
    : 'Last Wicket: N/A';
  const shouldScrollLw = lastWicketLabel.length > 34;

  // Resolve captain photos for Auto-Captains VS mode (falls back cleanly to team logo if captain unknown)
  const leftCapKey = leftTeam.captainFkey || snapshot.playingXI.left[0]?.fkey || leftTeam.fkey;
  const rightCapKey = rightTeam.captainFkey || snapshot.playingXI.right[0]?.fkey || rightTeam.fkey;
  const leftCapPhoto = leftTeam.captainPhotoUrl || snapshot.playingXI.left[0]?.photoUrl || leftTeam.logoUrl;
  const rightCapPhoto = rightTeam.captainPhotoUrl || snapshot.playingXI.right[0]?.photoUrl || rightTeam.logoUrl;

  return (
    <section className="ov-middle-row" aria-label="Broadcast metrics and matchup">
      {/* LEFT COLUMN: Subscribers + Win Probability */}
      <div className="ov-mid-col">
        <div className="ov-mid-upper">
          {subscriberWidget.enabled ? (
            <div className="ov-sub-box">
              <div className="ov-sub-row">
                <span className="ov-sub-pill">{subscriberWidget.label || 'SUB'}</span>
                <OdometerNumber value={subscriberWidget.count} />
              </div>
              {subscriberWidget.showSubscribeCta ? (
                <div className="ov-sub-cta" aria-hidden="true">
                  <svg width="20" height="14" viewBox="0 0 24 17" fill="currentColor">
                    <path d="M23.5 2.6a3 3 0 0 0-2.1-2.1C19.5 0 12 0 12 0S4.5 0 2.6.5A3 3 0 0 0 .5 2.6 31 31 0 0 0 0 8.5a31 31 0 0 0 .5 5.9 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 8.5a31 31 0 0 0-.5-5.9ZM9.6 12.1V4.9l6.3 3.6-6.3 3.6Z" />
                  </svg>
                  <span>SUBSCRIBE &amp; HIT BELL</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="ov-sub-box">
              <div className="ov-sub-pill">{snapshot.formatLabel}</div>
            </div>
          )}
        </div>

        <div className="ov-mid-lower">
          <div
            className={`ov-winprob-bar ${winProbability.isThreeWay && winProbability.drawPercent > 0 ? 'ov-winprob-bar--three' : ''}`}
            aria-label="Live win probability"
          >
            <div
              className="ov-winprob-seg ov-winprob-seg--left"
              style={{ flex: `${Math.max(1, winProbability.leftPercent)} 0 auto` }}
            >
              {winProbability.leftTeamShort} {winProbability.leftPercent}%
            </div>
            {winProbability.isThreeWay && winProbability.drawPercent > 0 ? (
              <div
                className="ov-winprob-seg ov-winprob-seg--draw"
                style={{ flex: `${Math.max(1, winProbability.drawPercent)} 0 auto` }}
              >
                DRW {winProbability.drawPercent}%
              </div>
            ) : null}
            <div
              className="ov-winprob-seg ov-winprob-seg--right"
              style={{ flex: `${Math.max(1, winProbability.rightPercent)} 0 auto` }}
            >
              {winProbability.rightTeamShort} {winProbability.rightPercent}%
            </div>
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: VS Banner + Last Wicket */}
      <div className="ov-mid-col ov-mid-col--center">
        <div className="ov-mid-upper">
          {vsBanner.mode === 'custom-image' && vsBanner.customImageUrl ? (
            <img
              src={vsBanner.customImageUrl}
              alt={vsBanner.customCaption || `${leftTeam.shortName} vs ${rightTeam.shortName}`}
              className="ov-vs-custom-img"
              width={620}
              height={146}
            />
          ) : (
            <div className="ov-vs-panel">
              <div className="ov-vs-captain">
                <PlayerAvatar
                  playerKey={`cap-l-${leftCapKey}`}
                  name={leftTeam.captainName || leftTeam.name}
                  photoUrl={leftCapPhoto}
                  jerseyUrl={leftTeam.jerseyUrl}
                  compact
                />
              </div>
              <VsLightningEmblem />
              <div className="ov-vs-captain">
                <PlayerAvatar
                  playerKey={`cap-r-${rightCapKey}`}
                  name={rightTeam.captainName || rightTeam.name}
                  photoUrl={rightCapPhoto}
                  jerseyUrl={rightTeam.jerseyUrl}
                  compact
                />
              </div>
            </div>
          )}
        </div>

        <div className="ov-mid-lower">
          <div className="ov-last-wkt-bar">
            <span className={`ov-last-wkt-inner ${shouldScrollLw ? 'ov-last-wkt-inner--scroll' : ''}`}>
              {lastWicketLabel}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Sub Alert + Donation Strip + Partnership */}
      <div className="ov-mid-col">
        <div className="ov-mid-upper">
          <div className="ov-right-mid-upper">
            <div className="ov-sub-alert-zone">
              {activeSubAlert ? (
                <div key={activeSubAlert.id} className="ov-sub-alert-pill">
                  {activeSubAlert.message}
                </div>
              ) : null}
            </div>

            {donationBar.enabled ? (
              <div className="ov-donation-strip">
                <div
                  className="ov-pay-icon"
                  style={{ backgroundColor: donationBar.providerColor }}
                >
                  {donationBar.providerIconUrl ? (
                    <img
                      src={donationBar.providerIconUrl}
                      alt="Donation provider"
                      width={48}
                      height={48}
                    />
                  ) : (
                    <span>{donationBar.providerBadgeText || 'e'}</span>
                  )}
                </div>
                {donationBar.accountNumber ? (
                  <span className="ov-pay-account">{donationBar.accountNumber}</span>
                ) : null}
                {currentDonor ? (
                  <span key={currentDonor.id} className="ov-pay-donor">
                    {currentDonor.donorName} {currentDonor.amountText}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ov-mid-lower">
          <div className="ov-pship-bar">
            P&apos;SHIP:&nbsp;&nbsp;{partnership.available ? partnership.formatted : '0 (0)'}
          </div>
        </div>
      </div>
    </section>
  );
};
