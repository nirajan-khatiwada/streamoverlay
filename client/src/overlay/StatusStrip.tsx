import React from 'react';
import type { MatchSnapshot } from '@shared/types';

interface StatusStripProps {
  snapshot: MatchSnapshot;
}

export const StatusStrip: React.FC<StatusStripProps> = ({ snapshot }) => {
  const { crr, rrr, powerplayLabel, chase, statusBannerText, status, format } = snapshot;

  // Render exact gold + cyan color-coded chase readout matching reference (`SPR NEED 129 RUNS IN 100 BALLS`)
  const renderRightStatus = () => {
    if (
      status === 'live' &&
      format !== 'TEST' &&
      chase.isChasing &&
      chase.runsNeeded !== null &&
      chase.ballsRemaining !== null
    ) {
      return (
        <>
          {chase.battingTeamShort} NEED <span className="ov-hl-gold">{chase.runsNeeded}</span> RUNS IN{' '}
          <span className="ov-hl-cyan">{chase.ballsRemaining}</span> BALLS
          {chase.isDls ? ' (DLS)' : ''}
        </>
      );
    }

    // Highlight trail/lead numbers cleanly on Test matches
    const leadMatch = statusBannerText.match(/^(.*?\b(?:TRAIL|LEAD|NEED)\s+(?:BY\s+)?)(\d+)(\s+RUNS.*)$/i);
    if (leadMatch) {
      return (
        <>
          {leadMatch[1]}
          <span className="ov-hl-gold">{leadMatch[2]}</span>
          {leadMatch[3]}
        </>
      );
    }

    return statusBannerText;
  };

  return (
    <div className="ov-status-strip">
      <div className="ov-rates-left">
        <span>CRR: {crr}</span>
        {rrr && chase.isChasing ? <span>RRR: {rrr}</span> : null}
        {powerplayLabel ? <span className="ov-pp-pill">{powerplayLabel}</span> : null}
      </div>
      <div className="ov-status-right">{renderRightStatus()}</div>
    </div>
  );
};
