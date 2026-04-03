/**
 * VetoSDKService — wraps the Veto browser SDK for local policy evaluation.
 *
 * Replaces the HTTP-based VetoGuardService with sub-ms local rule evaluation
 * via the veto-sdk browser SDK. Supports cloud sync, local rules that survive
 * cloud refresh, and HITL approval flow.
 */

import { Veto, type GuardResult, type Rule } from 'veto-sdk/browser';
import { vetoStore, type VetoConfig } from '@extension/storage';
import { createLogger } from '@src/background/log';

const logger = createLogger('VetoSDK');

export interface VetoDecision {
  allowed: boolean;
  decision: 'allow' | 'deny' | 'require_approval';
  reason?: string;
  ruleId?: string;
  approvalId?: string;
  latencyMs: number;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason?: string;
  ruleId?: string;
  timestamp: number;
}

/** Rich context injected into guard args for rule evaluation.
 * Open-ended: any key-value pairs are passed through to the SDK.
 * Known fields are typed for convenience; unknown fields are preserved. */
export interface VetoRichContext {
  computed_styles?: Record<string, string>;
  extracted_entities?: Record<string, unknown>;
  domain_time_seconds?: number;
  [key: string]: unknown;
}

const LOCAL_RULES_KEY = 'veto-local-rules';
const PENDING_APPROVALS_KEY = 'veto-pending-approvals';
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ALARM_PREFIX = 'veto-approval-timeout-';

class VetoSDKService {
  private _veto: Veto | null = null;
  private _config: VetoConfig | null = null;
  private _localRules: Rule[] = [];
  private _actionCount = 0;
  private _initPromise: Promise<void> | null = null;
  private _pendingApprovals = new Map<string, PendingApproval>();
  private _approvalResolvers = new Map<string, (approved: boolean) => void>();
  private _alarmListenerBound = false;

  /**
   * Callback fired when an action requires human approval.
   * Set this in background/index.ts to send approval requests to the side panel.
   */
  onApprovalNeeded: ((approval: PendingApproval) => void) | null = null;

  onDecisionMade: ((decision: VetoDecision & { toolName: string }) => void) | null = null;

  constructor() {
    this._bindAlarmListener();
    this._subscribeToConfigChanges();
  }

  private _bindAlarmListener(): void {
    if (this._alarmListenerBound) return;
    this._alarmListenerBound = true;

    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name.startsWith(ALARM_PREFIX)) {
        const approvalId = alarm.name.slice(ALARM_PREFIX.length);
        this._timeoutApproval(approvalId);
      }
    });
  }

  private _notifyDecision(decision: VetoDecision, toolName: string): void {
    try {
      this.onDecisionMade?.({ ...decision, toolName });
    } catch {
      // swallow — UI may be disconnected
    }
  }

  /**
   * Apply mode override to a deny/require_approval decision.
   * Returns null if mode is strict (enforce as-is), or an allow-through VetoDecision for log/shadow.
   */
  private _applyMode(
    mode: string,
    originalDecision: 'deny' | 'require_approval',
    toolName: string,
    reason: string | undefined,
    ruleId: string | undefined,
    latencyMs: number,
  ): VetoDecision | null {
    if (mode === 'log') {
      const logReason = `log_mode: would_${originalDecision} — ${reason || 'policy match'}`;
      logger.warning(`Veto LOG MODE [would ${originalDecision}]: ${toolName} — ${reason} [${latencyMs}ms]`);
      const result: VetoDecision = { allowed: true, decision: 'allow', latencyMs, reason: logReason, ruleId };
      this._notifyDecision(result, toolName);
      return result;
    }
    if (mode === 'shadow') {
      logger.info(`Veto SHADOW [would ${originalDecision}]: ${toolName} [${latencyMs}ms]`);
      return { allowed: true, decision: 'allow', latencyMs };
    }
    return null; // strict mode — enforce as-is
  }

  private _subscribeToConfigChanges(): void {
    vetoStore.subscribe(() => {
      this.refreshConfig().catch(err => {
        logger.error(`Config live-update failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    });
  }

  /**
   * Lazy-init: create the Veto SDK instance on first use.
   * Safe for SW lifecycle — re-inits if disposed.
   */
  private async ensureInitialized(): Promise<void> {
    if (this._veto) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._initialize();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  private async _initialize(): Promise<void> {
    const config = await this.getConfig();

    if (!config.enabled || !config.apiKey) {
      return;
    }

    try {
      await this._loadLocalRules();
      await this._loadPendingApprovals();

      this._veto = await Veto.fromCloud({
        apiKey: config.apiKey,
        endpoint: config.endpoint || 'https://api.veto.so',
        refreshIntervalMs: 60_000,
      });

      // TODO: Pass config.mode to SDK once fromCloud supports mode parameter.
      // Currently mode is stored in config but SDK fromCloud doesn't accept it.
      // Local rules are loaded into _localRules and will be applied to SDK
      // evaluation once the merge API is available (Phase 4).

      logger.info(`Veto SDK initialized (mode: ${config.mode}, local rules: ${this._localRules.length})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Veto SDK: ${msg}`);

      if (!config.failOpen) {
        throw error;
      }
    }
  }

  private async getConfig(): Promise<VetoConfig> {
    if (!this._config) {
      this._config = await vetoStore.getVeto();
    }
    return this._config;
  }

  async refreshConfig(): Promise<void> {
    this._config = await vetoStore.getVeto();

    if (this._veto) {
      this._veto.dispose();
      this._veto = null;
    }
  }

  resetSession(): void {
    this._actionCount = 0;
    if (this._veto) {
      this._veto.clearHistory();
    }
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled && config.apiKey.length > 0;
  }

  /**
   * Validate an action against local Veto rules.
   * For require_approval decisions, blocks until user responds or timeout.
   * Throws on SDK errors when failOpen=false (caller must handle).
   */
  async guard(
    actionName: string,
    actionArgs: unknown,
    currentUrl?: string,
    pageTitle?: string,
    richContext?: VetoRichContext,
  ): Promise<VetoDecision> {
    const config = await this.getConfig();

    if (!config.enabled || !config.apiKey) {
      return { allowed: true, decision: 'allow', latencyMs: 0 };
    }

    await this.ensureInitialized();

    if (!this._veto) {
      if (config.failOpen) {
        return { allowed: true, decision: 'allow', latencyMs: 0, reason: 'SDK not initialized (fail-open)' };
      }
      return { allowed: false, decision: 'deny', latencyMs: 0, reason: 'SDK not initialized' };
    }

    this._actionCount++;

    const toolName = `browser_${actionName}`;

    // Shallow-copy args to avoid mutating caller's object
    const args: Record<string, unknown> =
      typeof actionArgs === 'object' && actionArgs !== null ? { ...actionArgs } : {};

    if (currentUrl) args.current_url = currentUrl;
    if (pageTitle) args.page_title = pageTitle;
    args.action_index = this._actionCount;

    // Pass through ALL rich context fields — the SDK and local evaluator
    // use dot-notation field resolution, so any key here becomes available
    // as arguments.{key} in rule conditions. No whitelisting.
    if (richContext) {
      for (const [key, value] of Object.entries(richContext)) {
        if (value !== undefined) args[key] = value;
      }
    }

    const startTime = Date.now();

    // Evaluate local rules BEFORE cloud SDK (local rules take precedence)
    // Wrap args so local rule fields like "arguments.current_url" resolve correctly.
    // The SDK guard() already receives flat args, but NL-generated rules use "arguments.*" paths.
    const localEvalContext = { arguments: args } as Record<string, unknown>;
    const localResult = this._evaluateLocalRules(toolName, localEvalContext);
    if (localResult) {
      const latencyMs = Date.now() - startTime;
      if (localResult.decision === 'allow') {
        logger.info(`Veto LOCAL ALLOW: ${toolName} [${latencyMs}ms]`);
        return { allowed: true, decision: 'allow', latencyMs, ruleId: localResult.ruleId };
      }
      if (localResult.decision === 'deny') {
        const modeResult = this._applyMode(
          config.mode,
          'deny',
          toolName,
          localResult.reason,
          localResult.ruleId,
          latencyMs,
        );
        if (modeResult) return modeResult;
        logger.warning(`Veto LOCAL DENY: ${toolName} — ${localResult.reason} [${latencyMs}ms]`);
        const denyResult: VetoDecision = {
          allowed: false,
          decision: 'deny',
          reason: localResult.reason,
          ruleId: localResult.ruleId,
          latencyMs,
        };
        this._notifyDecision(denyResult, toolName);
        return denyResult;
      }
      const approvalModeResult = this._applyMode(
        config.mode,
        'require_approval',
        toolName,
        localResult.reason,
        localResult.ruleId,
        Date.now() - startTime,
      );
      if (approvalModeResult) return approvalModeResult;
      // strict mode: falls through to approval flow below
    }

    try {
      // If a local rule returned require_approval, use that; otherwise call cloud SDK
      const result: GuardResult =
        localResult?.decision === 'require_approval'
          ? { decision: 'require_approval' as const, reason: localResult.reason, ruleId: localResult.ruleId }
          : await this._veto.guard(toolName, args, {
              sessionId: config.sessionId || undefined,
              agentId: config.agentId || 'veto-browse',
            });

      const latencyMs = Date.now() - startTime;

      if (result.shadow) {
        logger.info(`Veto SHADOW [would ${result.shadowDecision}]: ${toolName} [${latencyMs}ms]`);
        return { allowed: true, decision: 'allow', latencyMs };
      }

      if (result.decision === 'allow') {
        logger.info(`Veto ALLOW: ${toolName} [${latencyMs}ms]`);
        return { allowed: true, decision: 'allow', latencyMs };
      }

      if (result.decision === 'require_approval') {
        const cloudApprovalMode = this._applyMode(
          config.mode,
          'require_approval',
          toolName,
          result.reason,
          result.ruleId,
          latencyMs,
        );
        if (cloudApprovalMode) return cloudApprovalMode;

        logger.warning(`Veto REQUIRE_APPROVAL: ${toolName} — ${result.reason} [${latencyMs}ms]`);

        const approvalId = result.approvalId || crypto.randomUUID();
        const pending: PendingApproval = {
          approvalId,
          toolName,
          args,
          reason: result.reason,
          ruleId: result.ruleId,
          timestamp: Date.now(),
        };

        this._pendingApprovals.set(approvalId, pending);
        await this._persistPendingApprovals();

        // Create resolver BEFORE notifying UI to prevent race
        // (user could respond before waitForApproval sets up the resolver)
        const approvalPromise = this.waitForApproval(approvalId);

        // Notify side panel (safe — swallows errors if port is gone)
        try {
          this.onApprovalNeeded?.(pending);
        } catch {
          logger.warning('Failed to notify side panel of approval request');
        }

        // Backup alarm for timeout after SW restart
        chrome.alarms.create(`${ALARM_PREFIX}${approvalId}`, {
          delayInMinutes: APPROVAL_TIMEOUT_MS / 60_000,
        });

        const approved = await approvalPromise;
        const totalLatencyMs = Date.now() - startTime;

        if (approved) {
          logger.info(`Veto APPROVED: ${toolName} [${totalLatencyMs}ms]`);
          const approvedResult: VetoDecision = {
            allowed: true,
            decision: 'allow',
            approvalId,
            latencyMs: totalLatencyMs,
          };
          this._notifyDecision(approvedResult, toolName);
          return approvedResult;
        }

        logger.warning(`Veto DENIED (after approval request): ${toolName} [${totalLatencyMs}ms]`);
        const deniedResult: VetoDecision = {
          allowed: false,
          decision: 'deny',
          reason: result.reason || 'Denied by user',
          ruleId: result.ruleId,
          approvalId,
          latencyMs: totalLatencyMs,
        };
        this._notifyDecision(deniedResult, toolName);
        return deniedResult;
      }

      const cloudDenyMode = this._applyMode(config.mode, 'deny', toolName, result.reason, result.ruleId, latencyMs);
      if (cloudDenyMode) return cloudDenyMode;
      logger.warning(`Veto DENY: ${toolName} — ${result.reason} [${latencyMs}ms]`);
      const denyResult: VetoDecision = {
        allowed: false,
        decision: 'deny',
        reason: result.reason,
        ruleId: result.ruleId,
        latencyMs,
      };
      this._notifyDecision(denyResult, toolName);
      return denyResult;
    } catch (error) {
      const latency = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Veto SDK error: ${message}`);

      if (config.failOpen) {
        logger.warning(`Veto: failing open — ${message}`);
        return { allowed: true, decision: 'allow', latencyMs: latency, reason: `fail_open: ${message}` };
      }

      // Rethrow so _vetoCheck can propagate fail-closed semantics
      throw error;
    }
  }

  // --- Approval waiting ---

  private waitForApproval(approvalId: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => {
        this._timeoutApproval(approvalId);
      }, APPROVAL_TIMEOUT_MS);

      this._approvalResolvers.set(approvalId, (approved: boolean) => {
        clearTimeout(timeout);
        resolve(approved);
      });
    });
  }

  /**
   * Called by background/index.ts when user responds to an approval request.
   */
  async resolveApproval(approvalId: string, approved: boolean): Promise<void> {
    if (!this._pendingApprovals.has(approvalId) && !this._approvalResolvers.has(approvalId)) {
      logger.warning(`resolveApproval called with unknown approvalId: ${approvalId}`);
      return;
    }

    const resolver = this._approvalResolvers.get(approvalId);
    if (resolver) {
      this._approvalResolvers.delete(approvalId);
      resolver(approved);
    }

    this._pendingApprovals.delete(approvalId);
    await this._persistPendingApprovals();
    chrome.alarms.clear(`${ALARM_PREFIX}${approvalId}`);
    logger.info(`Approval ${approvalId} ${approved ? 'APPROVED' : 'DENIED'}`);
  }

  /**
   * Auto-deny all pending approvals. Called when side panel disconnects
   * or executor is cancelled, to prevent promises from hanging.
   */
  denyAllPending(): void {
    for (const [id] of this._approvalResolvers) {
      this._timeoutApproval(id);
    }
  }

  private _timeoutApproval(approvalId: string): void {
    const resolver = this._approvalResolvers.get(approvalId);
    if (resolver) {
      logger.warning(`Approval ${approvalId} timed out — auto-denying`);
      this._approvalResolvers.delete(approvalId);
      this._pendingApprovals.delete(approvalId);
      resolver(false);
    }
  }

  /** Get all pending approvals (for side panel rehydration on reconnect). */
  getAllPendingApprovals(): PendingApproval[] {
    return Array.from(this._pendingApprovals.values());
  }

  // --- Local rules management ---

  async addLocalRules(rules: Rule[]): Promise<void> {
    if (this._localRules.length === 0) {
      await this._loadLocalRules();
    }

    for (const rule of rules) {
      const existingIdx = this._localRules.findIndex(r => r.id === rule.id);
      if (existingIdx >= 0) {
        this._localRules[existingIdx] = rule;
      } else {
        this._localRules.push(rule);
      }
    }
    await this._persistLocalRules();
    logger.info(`Local rules updated (total: ${this._localRules.length})`);
  }

  async removeLocalRule(ruleId: string): Promise<void> {
    this._localRules = this._localRules.filter(r => r.id !== ruleId);
    await this._persistLocalRules();
  }

  getLocalRules(): Rule[] {
    return [...this._localRules];
  }

  // --- Local rule evaluation ---

  private _evaluateLocalRules(
    toolName: string,
    args: Record<string, unknown>,
  ): { decision: 'allow' | 'deny' | 'require_approval'; reason?: string; ruleId?: string } | null {
    for (const rule of this._localRules) {
      if (!rule.enabled) continue;

      if (rule.tools && rule.tools.length > 0 && !rule.tools.includes(toolName)) continue;

      if (rule.conditions && rule.conditions.length > 0) {
        const allMatch = rule.conditions.every(c => this._evaluateCondition(c, args));
        if (!allMatch) continue;
      }

      // Evaluate condition_groups (OR between groups, AND within each group)
      if (rule.condition_groups && rule.condition_groups.length > 0) {
        const anyGroupMatch = rule.condition_groups.some(group => group.every(c => this._evaluateCondition(c, args)));
        if (!anyGroupMatch) continue;
      }

      const action = rule.action;
      if (action === 'block') {
        return { decision: 'deny', reason: rule.description || rule.name, ruleId: rule.id };
      }
      if (action === 'require_approval') {
        return { decision: 'require_approval', reason: rule.description || rule.name, ruleId: rule.id };
      }
      if (action === 'allow') {
        return { decision: 'allow', ruleId: rule.id };
      }
      // warn/log: don't block, just log and continue
      if (action === 'warn' || action === 'log') {
        logger.info(`Veto LOCAL ${action.toUpperCase()}: ${toolName} — ${rule.name}`);
      }
    }

    return null; // No local rule matched, fall through to cloud
  }

  private _evaluateCondition(
    condition: { field?: string; operator?: string; value?: unknown },
    args: Record<string, unknown>,
  ): boolean {
    if (!condition.field || !condition.operator) return true;

    const fieldValue = this._resolveField(condition.field, args);
    const expected = condition.value;

    // Unknown/missing fields never match — prevents false positives on negative operators.
    // Contract: "Unknown fields resolve to undefined and conditions on them won't match."
    if (fieldValue === undefined) return false;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === expected;
      case 'not_equals':
        return fieldValue !== expected;
      case 'contains':
        if (typeof fieldValue === 'string' && typeof expected === 'string') {
          return fieldValue.toLowerCase().includes(expected.toLowerCase());
        }
        if (Array.isArray(fieldValue)) return fieldValue.includes(expected);
        return false;
      case 'not_contains':
        if (typeof fieldValue === 'string' && typeof expected === 'string') {
          return !fieldValue.toLowerCase().includes(expected.toLowerCase());
        }
        if (Array.isArray(fieldValue)) return !fieldValue.includes(expected);
        return false;
      case 'starts_with':
        return (
          typeof fieldValue === 'string' &&
          typeof expected === 'string' &&
          fieldValue.toLowerCase().startsWith(expected.toLowerCase())
        );
      case 'ends_with':
        return (
          typeof fieldValue === 'string' &&
          typeof expected === 'string' &&
          fieldValue.toLowerCase().endsWith(expected.toLowerCase())
        );
      case 'matches':
        if (typeof fieldValue === 'string' && typeof expected === 'string') {
          try {
            return new RegExp(expected, 'i').test(fieldValue);
          } catch {
            return false;
          }
        }
        return false;
      case 'greater_than':
        return typeof fieldValue === 'number' && typeof expected === 'number' && fieldValue > expected;
      case 'less_than':
        return typeof fieldValue === 'number' && typeof expected === 'number' && fieldValue < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(fieldValue);
      case 'not_in':
        return Array.isArray(expected) && fieldValue !== undefined && !expected.includes(fieldValue);
      case 'length_greater_than':
        if (typeof fieldValue === 'string' || Array.isArray(fieldValue)) {
          return typeof expected === 'number' && fieldValue.length > expected;
        }
        return false;
      case 'percent_of':
        return typeof fieldValue === 'number' && typeof expected === 'number' && fieldValue >= expected;
      case 'within_hours':
      case 'outside_hours': {
        if (typeof expected !== 'string') return false;
        const parts = expected.split('-');
        if (parts.length !== 2) return false;
        const [sH, sM] = parts[0].split(':').map(Number);
        const [eH, eM] = parts[1].split(':').map(Number);
        if (isNaN(sH) || isNaN(eH)) return false;
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const startMins = sH * 60 + (sM || 0);
        const endMins = eH * 60 + (eM || 0);
        let within: boolean;
        if (startMins <= endMins) {
          within = nowMins >= startMins && nowMins < endMins;
        } else {
          within = nowMins >= startMins || nowMins < endMins;
        }
        return condition.operator === 'within_hours' ? within : !within;
      }
      default:
        // Unknown operator — don't silently fail. Log and skip (condition doesn't match).
        // Cloud SDK may support this operator; local evaluator just can't evaluate it.
        logger.warning(`Unknown operator "${condition.operator}" — skipping local evaluation (cloud SDK may handle)`);
        return false;
    }
  }

  private _resolveField(fieldPath: string, obj: Record<string, unknown>): unknown {
    const parts = fieldPath.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  // --- Storage ---

  private async _loadLocalRules(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(LOCAL_RULES_KEY);
      if (stored[LOCAL_RULES_KEY]) {
        this._localRules = JSON.parse(stored[LOCAL_RULES_KEY]);
      }
    } catch (error) {
      logger.error(`Failed to load local rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async _persistLocalRules(): Promise<void> {
    try {
      await chrome.storage.local.set({ [LOCAL_RULES_KEY]: JSON.stringify(this._localRules) });
    } catch (error) {
      logger.error(`Failed to persist local rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async _loadPendingApprovals(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(PENDING_APPROVALS_KEY);
      if (stored[PENDING_APPROVALS_KEY]) {
        const entries: [string, PendingApproval][] = JSON.parse(stored[PENDING_APPROVALS_KEY]);
        // After SW restart, all in-flight action promises are dead.
        // Clear orphaned approvals instead of re-broadcasting them.
        if (entries.length > 0) {
          logger.warning(`Clearing ${entries.length} orphaned approval(s) from previous SW lifecycle`);
          await chrome.storage.local.remove(PENDING_APPROVALS_KEY);
          for (const [id] of entries) {
            chrome.alarms.clear(`${ALARM_PREFIX}${id}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to load pending approvals: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async _persistPendingApprovals(): Promise<void> {
    try {
      const data = Array.from(this._pendingApprovals.entries());
      await chrome.storage.local.set({ [PENDING_APPROVALS_KEY]: JSON.stringify(data) });
    } catch (error) {
      logger.error(`Failed to persist pending approvals: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  dispose(): void {
    this.denyAllPending();
    if (this._veto) {
      this._veto.dispose();
      this._veto = null;
    }
  }
}

export const vetoSDK = new VetoSDKService();
