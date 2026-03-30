/**
 * Local policy evaluator — runs entirely in-extension, zero latency.
 * Evaluated BEFORE the Veto server check in Action.call().
 */

import { localPoliciesStore, type LocalPoliciesConfig, type BrowserAction } from '@extension/storage';
import { createLogger } from '@src/background/log';

const logger = createLogger('LocalPolicy');

export interface LocalPolicyDecision {
  allowed: boolean;
  reason?: string;
}

class LocalPolicyEvaluator {
  private _config: LocalPoliciesConfig | null = null;
  private _actionCount = 0;
  private _openTabs = 0;

  async getConfig(): Promise<LocalPoliciesConfig> {
    if (!this._config) {
      this._config = await localPoliciesStore.get();
    }
    return this._config;
  }

  async refreshConfig(): Promise<void> {
    this._config = await localPoliciesStore.get();
  }

  resetSession(): void {
    this._actionCount = 0;
    this._openTabs = 0;
  }

  incrementTabs(): void {
    this._openTabs++;
  }

  decrementTabs(): void {
    if (this._openTabs > 0) this._openTabs--;
  }

  /**
   * Evaluate an action against local policies.
   * Returns { allowed: false, reason } if blocked.
   */
  async evaluate(actionName: string, actionArgs: unknown, currentUrl?: string): Promise<LocalPolicyDecision> {
    const config = await this.getConfig();

    if (!config.enabled) {
      return { allowed: true };
    }

    this._actionCount++;

    // 1. Blocked actions
    if (config.blockedActions.includes(actionName as BrowserAction)) {
      logger.info(`Blocked action: ${actionName}`);
      return { allowed: false, reason: `Action "${actionName}" is disabled by local policy` };
    }

    // 2. Max actions per task
    if (config.maxActionsPerTask > 0 && this._actionCount > config.maxActionsPerTask) {
      logger.info(`Max actions reached: ${this._actionCount}/${config.maxActionsPerTask}`);
      return { allowed: false, reason: `Task limit reached (${config.maxActionsPerTask} actions max)` };
    }

    // 3. Domain restrictions (for navigation actions)
    if (actionName === 'go_to_url' || actionName === 'search_google' || actionName === 'open_tab') {
      const args = actionArgs as Record<string, unknown> | null;
      const url = args?.url as string | undefined;
      if (url) {
        const domainCheck = this._checkDomain(url, config);
        if (!domainCheck.allowed) return domainCheck;
      }
    }

    // Also check current URL for actions that interact with the page
    if (currentUrl && (actionName === 'click_element' || actionName === 'input_text' || actionName === 'send_keys')) {
      const domainCheck = this._checkDomain(currentUrl, config);
      if (!domainCheck.allowed) {
        return { allowed: false, reason: `Action blocked — current page domain is restricted` };
      }
    }

    // 4. Max tabs
    if (actionName === 'open_tab' && config.maxTabs > 0 && this._openTabs >= config.maxTabs) {
      return { allowed: false, reason: `Tab limit reached (${config.maxTabs} tabs max)` };
    }

    // 5. Content filters (for input_text and send_keys)
    if (actionName === 'input_text' || actionName === 'send_keys') {
      const args = actionArgs as Record<string, unknown> | null;
      const text = (args?.text as string) || (args?.keys as string) || '';
      if (text) {
        const contentCheck = this._checkContent(text, config);
        if (!contentCheck.allowed) return contentCheck;
      }
    }

    return { allowed: true };
  }

  private _checkDomain(url: string, config: LocalPoliciesConfig): LocalPolicyDecision {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      // Not a valid URL (e.g., search query) — allow
      return { allowed: true };
    }

    // Blocked domains
    if (config.blockedDomains.length > 0) {
      for (const blocked of config.blockedDomains) {
        const normalized = blocked.toLowerCase().trim();
        if (hostname === normalized || hostname.endsWith('.' + normalized)) {
          logger.info(`Blocked domain: ${hostname} matches ${normalized}`);
          return { allowed: false, reason: `Domain "${hostname}" is blocked by local policy` };
        }
      }
    }

    // Allowed domains (whitelist — if set, only these are permitted)
    if (config.allowedDomains.length > 0) {
      const isAllowed = config.allowedDomains.some(allowed => {
        const normalized = allowed.toLowerCase().trim();
        return hostname === normalized || hostname.endsWith('.' + normalized);
      });
      if (!isAllowed) {
        logger.info(`Domain not in allowlist: ${hostname}`);
        return { allowed: false, reason: `Domain "${hostname}" is not in the allowed list` };
      }
    }

    return { allowed: true };
  }

  private _checkContent(text: string, config: LocalPoliciesConfig): LocalPolicyDecision {
    for (const filter of config.contentFilters) {
      if (!filter.enabled) continue;
      try {
        const regex = new RegExp(filter.pattern, 'i');
        if (regex.test(text)) {
          logger.info(`Content filter matched: ${filter.label}`);
          return { allowed: false, reason: `Content blocked by filter: ${filter.label}` };
        }
      } catch {
        // Invalid regex — skip
      }
    }
    return { allowed: true };
  }
}

export const localPolicyEvaluator = new LocalPolicyEvaluator();
