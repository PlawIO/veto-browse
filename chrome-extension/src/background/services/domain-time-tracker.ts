/**
 * DomainTimeTracker — agent-scoped cumulative time tracking per domain.
 *
 * Tracks how long the agent has spent on each domain during a task.
 * Resets per task (like existing session behavior). Injects
 * `domain_time_seconds` into Veto guard context for time-based rules
 * (e.g., "block social media after 20 minutes of agent time").
 */

import { createLogger } from '@src/background/log';

const logger = createLogger('DomainTimeTracker');

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

class DomainTimeTrackerService {
  /** Accumulated milliseconds per domain (finalized segments only) */
  private _accumulated = new Map<string, number>();
  private _currentDomain: string | null = null;
  private _segmentStart: number | null = null;

  /**
   * Call when the agent navigates to a new URL.
   * Finalizes time on the previous domain and starts a new segment.
   */
  recordNavigation(url: string): void {
    const domain = extractDomain(url);

    // Finalize previous segment even for non-parsable URLs (about:blank, chrome://)
    if (!domain) {
      this._finalizeSegment();
      this._currentDomain = null;
      this._segmentStart = null;
      return;
    }

    if (domain === this._currentDomain) return;

    this._finalizeSegment();
    this._currentDomain = domain;
    this._segmentStart = Date.now();
  }

  /**
   * Get cumulative seconds the agent has spent on the given URL's domain.
   * Includes the in-progress segment if still on that domain.
   */
  getDomainTimeSeconds(url: string): number {
    const domain = extractDomain(url);
    if (!domain) return 0;

    let total = this._accumulated.get(domain) ?? 0;

    // Add the live segment if still on this domain
    if (domain === this._currentDomain && this._segmentStart !== null) {
      total += Date.now() - this._segmentStart;
    }

    return Math.round(total / 1000);
  }

  /** Finalize the current segment into accumulated time. */
  private _finalizeSegment(): void {
    if (this._currentDomain && this._segmentStart !== null) {
      const elapsed = Date.now() - this._segmentStart;
      const prev = this._accumulated.get(this._currentDomain) ?? 0;
      this._accumulated.set(this._currentDomain, prev + elapsed);
    }
  }

  reset(): void {
    this._accumulated.clear();
    this._currentDomain = null;
    this._segmentStart = null;
    logger.info('Domain time tracker reset');
  }

  /** Finalize and return a snapshot of all domain times (for debugging). */
  getSnapshot(): Record<string, number> {
    this._finalizeSegment();
    if (this._currentDomain) {
      this._segmentStart = Date.now();
    }
    const result: Record<string, number> = {};
    for (const [domain, ms] of this._accumulated) {
      result[domain] = Math.round(ms / 1000);
    }
    return result;
  }
}

export const domainTimeTracker = new DomainTimeTrackerService();
