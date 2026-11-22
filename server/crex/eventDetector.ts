import crypto from 'node:crypto';
import type { BroadcastEvent, MatchSnapshot } from '../../shared/types.js';

/**
 * Deterministic state-diff detector for live cricket broadcast events.
 *
 * Guarantees:
 * 1. Never triggers stingers or SFX on initial match hydration (first snapshot).
 * 2. Deduplicates per delivery fingerprint so repeated 2-4s polls while a badge
 *    stays on "4", "6", "W", or "OVER" never fire twice.
 * 3. Prioritizes WICKET > SIX > FOUR > MILESTONE (50/100) > OVER.
 */
export class BroadcastEventDetector {
  private prevSnapshot: MatchSnapshot | null = null;
  private firedKeys = new Set<string>();
  private announcedMilestones = new Set<string>();

  reset(): void {
    this.prevSnapshot = null;
    this.firedKeys.clear();
    this.announcedMilestones.clear();
  }

  evaluate(next: MatchSnapshot): BroadcastEvent[] {
    const prev = this.prevSnapshot;
    this.prevSnapshot = next;

    // Initial hydration: seed existing milestones without triggering audio/stingers
    if (!prev || prev.matchKey !== next.matchKey) {
      this.firedKeys.clear();
      this.announcedMilestones.clear();
      this.seedMilestones(next);
      return [];
    }

    // Do not fire live ball events for finished/upcoming states unless live
    if (next.status !== 'live') {
      return [];
    }

    const events: BroadcastEvent[] = [];
    const deliveryKey = next.lastDeliveryKey;
    const isNewDelivery = deliveryKey !== prev.lastDeliveryKey;
    const latestOver = next.recentOvers[next.recentOvers.length - 1];
    const latestBall = latestOver?.balls.find((b) => b.isLatest);

    // 1. Check WICKET (wickets incremented OR latest ball is wicket OR centerBadge transitioned to wicket)
    const prevWickets = this.extractWickets(prev.leftTeam.score);
    const nextWickets = this.extractWickets(next.leftTeam.score);
    const wicketFell =
      (next.inning === prev.inning && nextWickets > prevWickets) ||
      (isNewDelivery && latestBall?.kind === 'wicket') ||
      (next.centerBadge.tone === 'wicket' && prev.centerBadge.tone !== 'wicket');

    if (wicketFell) {
      const dedupeKey = `wicket:${next.inning}:${nextWickets}:${latestOver?.overNumber ?? 0}`;
      if (!this.firedKeys.has(dedupeKey)) {
        this.firedKeys.add(dedupeKey);
        const lwSubtitle = next.lastWicket.available
          ? `${next.lastWicket.shortName} ${next.lastWicket.runs} (${next.lastWicket.balls})${next.lastWicket.dismissalText ? ` · ${next.lastWicket.dismissalText.toUpperCase()}` : ''}`
          : next.centerBadge.subtext?.toUpperCase();
        events.push(
          this.makeEvent({
            type: 'WICKET',
            title: 'WICKET',
            subtitle: lwSubtitle,
            soundKey: 'wicket',
            showFullScreenStinger: true,
            durationMs: 3000,
          })
        );
      }
    }

    // 2. Check SIX (latest ball is 6 OR batsman sixes incremented OR centerBadge transitioned to 6)
    const prevSixes = this.sumBatsmenStat(prev, 'sixes');
    const nextSixes = this.sumBatsmenStat(next, 'sixes');
    const hitSix =
      !wicketFell &&
      ((isNewDelivery && latestBall?.kind === 'six') ||
        (next.inning === prev.inning && nextSixes > prevSixes) ||
        (next.centerBadge.tone === 'six' && prev.centerBadge.tone !== 'six'));

    if (hitSix) {
      const dedupeKey = `six:${deliveryKey}`;
      if (!this.firedKeys.has(dedupeKey)) {
        this.firedKeys.add(dedupeKey);
        const scorer = this.findScoringBatsman(prev, next);
        events.push(
          this.makeEvent({
            type: 'SIX',
            title: 'SIX',
            subtitle: scorer ? `${scorer.shortName} · ${scorer.runs} (${scorer.balls})` : undefined,
            soundKey: 'six',
            showFullScreenStinger: true,
            durationMs: 2900,
          })
        );
      }
    }

    // 3. Check FOUR (latest ball is 4 OR batsman fours incremented OR centerBadge transitioned to 4)
    const prevFours = this.sumBatsmenStat(prev, 'fours');
    const nextFours = this.sumBatsmenStat(next, 'fours');
    const hitFour =
      !wicketFell &&
      !hitSix &&
      ((isNewDelivery && latestBall?.kind === 'four') ||
        (next.inning === prev.inning && nextFours > prevFours) ||
        (next.centerBadge.tone === 'four' && prev.centerBadge.tone !== 'four'));

    if (hitFour) {
      const dedupeKey = `four:${deliveryKey}`;
      if (!this.firedKeys.has(dedupeKey)) {
        this.firedKeys.add(dedupeKey);
        const scorer = this.findScoringBatsman(prev, next);
        events.push(
          this.makeEvent({
            type: 'FOUR',
            title: 'FOUR',
            subtitle: scorer ? `${scorer.shortName} · ${scorer.runs} (${scorer.balls})` : undefined,
            soundKey: 'four',
            showFullScreenStinger: true,
            durationMs: 2600,
          })
        );
      }
    }

    // 4. Check Batsman Milestones (50 / 100)
    for (const bat of next.batsmen) {
      if (!bat) continue;
      const prevBat = prev.batsmen.find((b) => b?.fkey === bat.fkey);
      if (!prevBat) continue;

      if (prevBat.runs < 100 && bat.runs >= 100) {
        const mKey = `100:${next.inning}:${bat.fkey}`;
        if (!this.announcedMilestones.has(mKey)) {
          this.announcedMilestones.add(mKey);
          events.push(
            this.makeEvent({
              type: 'MILESTONE_100',
              title: 'CENTURY!',
              subtitle: `${bat.name.toUpperCase()} · ${bat.runs} (${bat.balls})`,
              soundKey: 'milestone',
              showFullScreenStinger: true,
              durationMs: 3200,
            })
          );
        }
      } else if (prevBat.runs < 50 && bat.runs >= 50) {
        const mKey = `50:${next.inning}:${bat.fkey}`;
        if (!this.announcedMilestones.has(mKey)) {
          this.announcedMilestones.add(mKey);
          events.push(
            this.makeEvent({
              type: 'MILESTONE_50',
              title: 'FIFTY!',
              subtitle: `${bat.name.toUpperCase()} · ${bat.runs} (${bat.balls})`,
              soundKey: 'milestone',
              showFullScreenStinger: true,
              durationMs: 2800,
            })
          );
        }
      }
    }

    // 5. Check OVER Complete (for subtle chime + optional auto Bowling Card cutaway)
    const overCompleted =
      (next.centerBadge.tone === 'over' && prev.centerBadge.tone !== 'over') ||
      (isNewDelivery &&
        Boolean(latestOver?.isComplete) &&
        next.leftTeam.overs.endsWith('.0)') &&
        next.leftTeam.overs !== prev.leftTeam.overs);

    if (overCompleted && latestOver) {
      const overKey = `over:${next.inning}:${latestOver.overNumber}`;
      if (!this.firedKeys.has(overKey)) {
        this.firedKeys.add(overKey);
        events.push(
          this.makeEvent({
            type: 'OVER',
            title: `END OF OVER ${latestOver.overNumber}`,
            subtitle: `${latestOver.totalRuns} RUNS · ${next.leftTeam.shortName} ${next.leftTeam.score}`,
            soundKey: 'over',
            showFullScreenStinger: false,
            durationMs: 1200,
          })
        );
      }
    }

    // Bound memory growth over long 5-day Test matches
    if (this.firedKeys.size > 400) {
      const trimmed = [...this.firedKeys].slice(-200);
      this.firedKeys = new Set(trimmed);
    }

    return events;
  }

  private seedMilestones(snap: MatchSnapshot): void {
    for (const bat of snap.batsmen) {
      if (!bat) continue;
      if (bat.runs >= 50) this.announcedMilestones.add(`50:${snap.inning}:${bat.fkey}`);
      if (bat.runs >= 100) this.announcedMilestones.add(`100:${snap.inning}:${bat.fkey}`);
    }
  }

  private extractWickets(scoreText: string): number {
    // Handles "75-3" or "368 & 82-2" or "720-9d"
    const tail = scoreText.includes('&') ? scoreText.split('&').pop() ?? scoreText : scoreText;
    const m = tail.match(/-(\d+)/);
    return m ? Number.parseInt(m[1] ?? '0', 10) : 0;
  }

  private sumBatsmenStat(snap: MatchSnapshot, field: 'fours' | 'sixes'): number {
    return (snap.batsmen[0]?.[field] ?? 0) + (snap.batsmen[1]?.[field] ?? 0);
  }

  private findScoringBatsman(prev: MatchSnapshot, next: MatchSnapshot) {
    for (const bat of next.batsmen) {
      if (!bat) continue;
      const old = prev.batsmen.find((b) => b?.fkey === bat.fkey);
      if (old && bat.runs > old.runs) return bat;
    }
    return next.batsmen.find((b) => b?.isStriker) ?? next.batsmen[0] ?? null;
  }

  private makeEvent(
    opts: Omit<BroadcastEvent, 'id' | 'timestamp'>
  ): BroadcastEvent {
    return {
      ...opts,
      id: `evt_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
  }
}
