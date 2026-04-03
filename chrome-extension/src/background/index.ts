import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  Actors,
  ExecutionState,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  RuntimeTaskStatus,
  taskRuntimeStore,
  vetoStore,
  type AgentEvent,
  type BackgroundToSidePanelMessage,
  type ContentRuntimeMessage,
  type PolicyRule,
  type RuntimeExecutionEvent,
  type SidePanelToBackgroundMessage,
  type VerificationResult,
} from '@extension/storage';
import { t } from '@extension/i18n';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Rule } from 'veto-sdk/browser';
import { Executor } from './agent/executor';
import { createChatModel } from './agent/helper';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
import BrowserContext from './browser/context';
import { injectBuildDomTreeScripts } from './browser/dom/service';
import { createLogger } from './log';
import { generatePolicy, looksLikePolicyDeclaration, validateRuntimeRules } from './services/policy-generator';
import { SpeechToTextService } from './services/speechToText';
import { vetoSDK } from './services/veto-sdk';

const logger = createLogger('background');

const browserContext = new BrowserContext({});
let currentExecutor: Executor | null = null;
let currentPort: chrome.runtime.Port | null = null;
let pendingPolicyRules: Rule[] | null = null;
let pendingPolicyNonce: string | null = null;
let pendingPolicyExplanation: string | null = null;
let pendingPolicyClarification: {
  input: string;
  questions: string[];
  explanation: string;
  nonce: string;
} | null = null;
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

function clearPendingPolicyPreview(): void {
  pendingPolicyRules = null;
  pendingPolicyNonce = null;
  pendingPolicyExplanation = null;
}

function clearPendingPolicyClarification(): void {
  pendingPolicyClarification = null;
}

function postToSidePanel(message: BackgroundToSidePanelMessage): void {
  if (!currentPort) {
    return;
  }

  try {
    currentPort.postMessage(message);
  } catch (error) {
    logger.warning('Failed to post message to side panel:', error);
  }
}

async function publishRuntimeSnapshot(port: chrome.runtime.Port = currentPort as chrome.runtime.Port): Promise<void> {
  if (!port) {
    return;
  }

  const snapshot = await taskRuntimeStore.get();
  try {
    port.postMessage({
      type: 'runtime_snapshot',
      snapshot,
    } satisfies BackgroundToSidePanelMessage);
  } catch (error) {
    logger.warning('Failed to publish runtime snapshot:', error);
  }
}

async function emitTrustSignal(taskId: string, content: string): Promise<void> {
  const signal = await taskRuntimeStore.recordTrustSignal(taskId, content);
  postToSidePanel({
    type: 'trust_signal',
    taskId,
    content,
    timestamp: signal.timestamp,
  });
}

chrome.runtime.onMessageExternal.addListener(
  (message: Record<string, unknown>, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
    if (message?.type === 'veto_auth_callback' && sender.url?.startsWith('https://veto.so')) {
      const token = message.token;
      if (!token || typeof token !== 'string' || token.length < 20) {
        sendResponse({ success: false, error: 'Invalid token' });
        return false;
      }
      vetoStore
        .updateVeto({
          authToken: token,
          userEmail: (message.email as string) || '',
          isAuthenticated: true,
          enabled: true,
        })
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, error: 'Storage failed' }));
      return true;
    }
    return false;
  },
);

async function emitActiveTrustState(taskId: string): Promise<void> {
  const [firewallConfig, vetoConfig] = await Promise.all([firewallStore.getFirewall(), vetoStore.getVeto()]);
  const firewallSummary = firewallConfig.enabled
    ? `Firewall on (allow ${firewallConfig.allowList.length}, deny ${firewallConfig.denyList.length})`
    : 'Firewall off';
  const vetoSummary = vetoConfig.enabled && vetoConfig.apiKey ? `Veto ${vetoConfig.mode} mode` : 'Veto off';
  await emitTrustSignal(taskId, `Trust guardrails: ${firewallSummary}; ${vetoSummary}.`);
}

async function emitRuntimeTrustSignal(content: string): Promise<void> {
  const taskId = await currentExecutor?.getCurrentTaskId();
  if (!taskId) {
    return;
  }

  await emitTrustSignal(taskId, content);
}

async function syncRuntimeFromEvent(event: AgentEvent): Promise<RuntimeExecutionEvent> {
  const runtimeEvent = await taskRuntimeStore.recordEvent(event);

  if (
    event.actor === Actors.VALIDATOR &&
    (event.state === ExecutionState.STEP_OK || event.state === ExecutionState.STEP_FAIL)
  ) {
    const verification: VerificationResult = {
      taskId: event.data.taskId,
      passed: event.state === ExecutionState.STEP_OK,
      reason: event.data.details,
      timestamp: event.timestamp,
    };
    await taskRuntimeStore.setVerification(verification);
  }

  switch (event.state) {
    case ExecutionState.TASK_START:
    case ExecutionState.TASK_RESUME:
      await taskRuntimeStore.setStatus(RuntimeTaskStatus.RUNNING);
      break;
    case ExecutionState.TASK_PAUSE:
      await taskRuntimeStore.setStatus(RuntimeTaskStatus.PAUSED);
      break;
    case ExecutionState.TASK_OK:
      await taskRuntimeStore.setStatus(RuntimeTaskStatus.COMPLETED);
      break;
    case ExecutionState.TASK_FAIL:
      await taskRuntimeStore.setStatus(RuntimeTaskStatus.FAILED);
      break;
    case ExecutionState.TASK_CANCEL:
      await taskRuntimeStore.setStatus(RuntimeTaskStatus.CANCELLED);
      break;
    default:
      break;
  }

  return runtimeEvent;
}

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId && changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    await injectBuildDomTreeScripts(tabId);
  }
});

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  browserContext.removeAttachedPage(tabId);
});

logger.info('background loaded');

// Veto badge: show enforcement status on extension icon
async function updateVetoBadge() {
  try {
    const config = await vetoStore.getVeto();
    if (!config.enabled || !config.apiKey) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const badges: Record<string, { text: string; color: string }> = {
      strict: { text: 'ON', color: '#22c55e' },
      log: { text: 'LOG', color: '#eab308' },
      shadow: { text: 'SHD', color: '#6b7280' },
    };
    const badge = badges[config.mode] ?? badges.strict;
    chrome.action.setBadgeText({ text: badge.text });
    chrome.action.setBadgeBackgroundColor({ color: badge.color });
  } catch {
    // ignore — badge is cosmetic
  }
}
updateVetoBadge();
vetoStore.subscribe(() => {
  updateVetoBadge();
});

// Listen for simple messages (e.g., from content script and options page)
chrome.runtime.onMessage.addListener((message: ContentRuntimeMessage, sender) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  if ((message.type === 'content_runtime_ready' || message.type === 'content_runtime_update') && sender.tab?.id) {
    taskRuntimeStore
      .setContentRuntime({
        ...message.payload,
        tabId: sender.tab.id,
      })
      .catch(error => {
        logger.warning('Failed to persist content runtime snapshot:', error);
      });
  }

  return false;
});

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    const senderUrl = port.sender?.url;
    const senderId = port.sender?.id;

    if (!senderUrl || senderId !== chrome.runtime.id || senderUrl !== SIDE_PANEL_URL) {
      logger.warning('Blocked unauthorized side-panel-connection', senderId, senderUrl);
      port.disconnect();
      return;
    }

    currentPort = port;
    void publishRuntimeSnapshot(port);

    // Wire Veto decision callback to show enforcement log in side panel
    vetoSDK.onDecisionMade = decision => {
      postToSidePanel({
        type: 'veto_decision',
        allowed: decision.allowed,
        decision: decision.decision,
        reason: decision.reason,
        toolName: decision.toolName,
        latencyMs: decision.latencyMs,
        ruleId: decision.ruleId,
      });

      if (!decision.allowed || decision.reason?.startsWith('log_mode:')) {
        void emitRuntimeTrustSignal(
          `[Veto] ${decision.allowed ? 'Would block' : 'Blocked'} ${decision.toolName.replace('browser_', '')}${decision.reason ? ` — ${decision.reason}` : ''}`,
        );
      }
    };

    // Wire Veto approval callback to send requests to side panel
    vetoSDK.onApprovalNeeded = approval => {
      postToSidePanel({
        type: 'veto_approval_request',
        approvalId: approval.approvalId,
        toolName: approval.toolName,
        args: approval.args,
        reason: approval.reason,
        ruleId: approval.ruleId,
      });
      void emitRuntimeTrustSignal(
        `[Veto] Approval required for ${approval.toolName.replace('browser_', '')}${approval.reason ? ` — ${approval.reason}` : ''}`,
      );
    };

    // Send current Veto mode to side panel on connect
    vetoStore.getVeto().then(config => {
      if (config.enabled && config.apiKey) {
        postToSidePanel({ type: 'veto_mode_changed', mode: config.mode });
      }
    });

    // Re-broadcast any in-flight approvals (from current SW lifecycle only;
    // orphaned approvals from previous SW lifecycle are cleared on init)
    for (const approval of vetoSDK.getAllPendingApprovals()) {
      postToSidePanel({
        type: 'veto_approval_request',
        approvalId: approval.approvalId,
        toolName: approval.toolName,
        args: approval.args,
        reason: approval.reason,
        ruleId: approval.ruleId,
      });
    }

    if (pendingPolicyRules && pendingPolicyRules.length > 0 && pendingPolicyNonce) {
      postToSidePanel({
        type: 'policy_preview',
        rules: pendingPolicyRules as PolicyRule[],
        explanation: pendingPolicyExplanation || 'Review and activate the generated policy.',
        nonce: pendingPolicyNonce,
      });
    }

    if (pendingPolicyClarification) {
      postToSidePanel({
        type: 'policy_clarification',
        explanation: pendingPolicyClarification.explanation,
        questions: pendingPolicyClarification.questions,
        nonce: pendingPolicyClarification.nonce,
      });
    }

    port.onMessage.addListener(async (message: SidePanelToBackgroundMessage) => {
      try {
        switch (message.type) {
          case 'heartbeat':
            postToSidePanel({ type: 'heartbeat_ack' });
            break;

          case 'runtime_snapshot_request':
            await publishRuntimeSnapshot(port);
            break;

          case 'new_task': {
            if (!message.task) return postToSidePanel({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            if (!message.tabId) return postToSidePanel({ type: 'error', error: t('bg_errors_noTabId') });

            // Policy generation intercept: explicit "policy: ..." prefix or
            // natural-language policy declarations (standing rules with conditions).
            const taskTrimmed = message.task.trim();
            const nlInput = /^policy:/i.test(taskTrimmed)
              ? taskTrimmed.replace(/^policy:\s*/i, '').trim()
              : looksLikePolicyDeclaration(taskTrimmed)
                ? taskTrimmed
                : null;
            if (nlInput) {
              logger.info('policy_generate', nlInput);
              postToSidePanel({ type: 'policy_generating' });

              const policyResult = await generatePolicy(nlInput);
              if (!policyResult.success) {
                return postToSidePanel({
                  type: 'error',
                  error: policyResult.error || 'Failed to generate policy.',
                });
              }

              if (policyResult.kind === 'clarification') {
                clearPendingPolicyPreview();
                pendingPolicyClarification = {
                  input: nlInput,
                  explanation: policyResult.clarification.explanation,
                  questions: policyResult.clarification.questions,
                  nonce: crypto.randomUUID(),
                };
                postToSidePanel({
                  type: 'policy_clarification',
                  explanation: pendingPolicyClarification.explanation,
                  questions: pendingPolicyClarification.questions,
                  nonce: pendingPolicyClarification.nonce,
                });
                break;
              }

              clearPendingPolicyClarification();
              pendingPolicyRules = policyResult.rules;
              pendingPolicyNonce = crypto.randomUUID();
              pendingPolicyExplanation = policyResult.explanation;
              postToSidePanel({
                type: 'policy_preview',
                rules: policyResult.rules as PolicyRule[],
                explanation: policyResult.explanation,
                nonce: pendingPolicyNonce,
              });
              break;
            }

            logger.info('new_task', message.tabId, message.task);
            currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
            await taskRuntimeStore.startTask(message.taskId, message.task, message.tabId);
            await emitActiveTrustState(message.taskId);
            subscribeToExecutorEvents(currentExecutor);

            const result = await currentExecutor.execute();
            logger.info('new_task execution result', message.tabId, result);
            break;
          }

          case 'follow_up_task': {
            if (!message.task) return postToSidePanel({ type: 'error', error: t('bg_cmd_followUpTask_noTask') });
            if (!message.tabId) return postToSidePanel({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('follow_up_task', message.tabId, message.task);

            if (currentExecutor) {
              await taskRuntimeStore.startTask(message.taskId, message.task, message.tabId);
              await emitActiveTrustState(message.taskId);
              currentExecutor.addFollowUpTask(message.task);
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return postToSidePanel({ type: 'error', error: t('bg_cmd_followUpTask_cleaned') });
            }
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return postToSidePanel({ type: 'error', error: t('bg_errors_noRunningTask') });
            vetoSDK.denyAllPending();
            await taskRuntimeStore.setStatus(RuntimeTaskStatus.CANCELLED);
            await currentExecutor.cancel();
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return postToSidePanel({ type: 'error', error: t('bg_cmd_resumeTask_noTask') });
            await taskRuntimeStore.setStatus(RuntimeTaskStatus.RUNNING);
            await currentExecutor.resume();
            return postToSidePanel({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return postToSidePanel({ type: 'error', error: t('bg_errors_noRunningTask') });
            await taskRuntimeStore.setStatus(RuntimeTaskStatus.PAUSED);
            await currentExecutor.pause();
            return postToSidePanel({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'state': {
            try {
              const browserState = await browserContext.getState(true);
              const elementsText = browserState.elementTree.clickableElementsToString(
                DEFAULT_AGENT_OPTIONS.includeAttributes,
              );

              logger.info('state', browserState);
              logger.info('interactive elements', elementsText);
              return port.postMessage({ type: 'success', msg: t('bg_cmd_state_printed') });
            } catch (error) {
              logger.error('Failed to get state:', error);
              return port.postMessage({ type: 'error', error: t('bg_cmd_state_failed') });
            }
          }

          case 'nohighlight': {
            const page = await browserContext.getCurrentPage();
            await page.removeHighlight();
            return port.postMessage({ type: 'success', msg: t('bg_cmd_nohighlight_ok') });
          }

          case 'speech_to_text': {
            try {
              if (!message.audio) {
                return port.postMessage({
                  type: 'speech_to_text_error',
                  error: t('bg_cmd_stt_noAudioData'),
                });
              }

              logger.info('Processing speech-to-text request...');

              // Get all providers for speech-to-text service
              const providers = await llmProviderStore.getAllProviders();

              // Create speech-to-text service with all providers
              const speechToTextService = await SpeechToTextService.create(providers);

              // Extract base64 audio data (remove data URL prefix if present)
              let base64Audio = message.audio;
              if (base64Audio.startsWith('data:')) {
                base64Audio = base64Audio.split(',')[1];
              }

              // Transcribe audio
              const transcribedText = await speechToTextService.transcribeAudio(base64Audio);

              logger.info('Speech-to-text completed successfully');
              return port.postMessage({
                type: 'speech_to_text_result',
                text: transcribedText,
              });
            } catch (error) {
              logger.error('Speech-to-text failed:', error);
              return port.postMessage({
                type: 'speech_to_text_error',
                error: error instanceof Error ? error.message : t('bg_cmd_stt_failed'),
              });
            }
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            if (!message.taskId) return port.postMessage({ type: 'error', error: t('bg_errors_noTaskId') });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: t('bg_cmd_replay_noHistory') });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              // Switch to the specified tab
              await browserContext.switchTab(message.tabId);
              await taskRuntimeStore.startTask(message.taskId, message.task, message.tabId);
              await emitActiveTrustState(message.taskId);
              // Setup executor with the new taskId and a dummy task description
              currentExecutor = await setupExecutor(message.taskId, message.task, browserContext);
              subscribeToExecutorEvents(currentExecutor);

              // Run replayHistory with the history session ID
              const result = await currentExecutor.replayHistory(message.historySessionId);
              logger.debug('replay execution result', message.tabId, result);
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('bg_cmd_replay_failed'),
              });
            }
            break;
          }

          case 'veto_approval_response': {
            if (!message.approvalId) return port.postMessage({ type: 'error', error: 'Missing approvalId' });
            const approved = message.decision === 'approve';
            await vetoSDK.resolveApproval(message.approvalId, approved);
            return port.postMessage({ type: 'success' });
          }

          case 'policy_clarification_response': {
            if (!pendingPolicyClarification) {
              return port.postMessage({ type: 'error', error: 'No policy clarification is pending.' });
            }
            if (!message.answer.trim()) {
              return port.postMessage({ type: 'error', error: 'Please answer the clarification question first.' });
            }
            if (!message.nonce || message.nonce !== pendingPolicyClarification.nonce) {
              return port.postMessage({
                type: 'error',
                error: 'Policy clarification has changed. Please answer the latest questions.',
              });
            }

            postToSidePanel({ type: 'policy_generating' });
            const clarifiedInput = `${pendingPolicyClarification.input}\n\nClarifications:\n${message.answer.trim()}`;
            const policyResult = await generatePolicy(clarifiedInput);
            if (!policyResult.success) {
              return postToSidePanel({
                type: 'error',
                error: policyResult.error || 'Failed to generate policy.',
              });
            }

            if (policyResult.kind === 'clarification') {
              pendingPolicyClarification = {
                input: clarifiedInput,
                explanation: policyResult.clarification.explanation,
                questions: policyResult.clarification.questions,
                nonce: crypto.randomUUID(),
              };
              clearPendingPolicyPreview();
              return postToSidePanel({
                type: 'policy_clarification',
                explanation: pendingPolicyClarification.explanation,
                questions: pendingPolicyClarification.questions,
                nonce: pendingPolicyClarification.nonce,
              });
            }

            clearPendingPolicyClarification();
            pendingPolicyRules = policyResult.rules;
            pendingPolicyNonce = crypto.randomUUID();
            pendingPolicyExplanation = policyResult.explanation;
            return postToSidePanel({
              type: 'policy_preview',
              rules: policyResult.rules as PolicyRule[],
              explanation: policyResult.explanation,
              nonce: pendingPolicyNonce,
            });
          }

          case 'policy_activate': {
            if (!pendingPolicyRules || pendingPolicyRules.length === 0) {
              return port.postMessage({ type: 'error', error: 'No pending policy to activate.' });
            }
            if (!message.nonce || message.nonce !== pendingPolicyNonce) {
              return port.postMessage({
                type: 'error',
                error: 'Policy preview has changed. Please review the latest version.',
              });
            }
            await vetoSDK.addLocalRules(pendingPolicyRules);
            const ruleCount = pendingPolicyRules.length;
            clearPendingPolicyPreview();
            clearPendingPolicyClarification();
            logger.info(`Policy activated: ${ruleCount} rule(s)`);
            return port.postMessage({ type: 'policy_activated', ruleCount });
          }

          case 'policy_cancel': {
            clearPendingPolicyPreview();
            clearPendingPolicyClarification();
            return port.postMessage({ type: 'policy_cancelled' });
          }

          case 'veto_preset_activate': {
            if (!message.rules || !Array.isArray(message.rules)) {
              return port.postMessage({ type: 'error', error: 'Missing preset rules.' });
            }
            const validatedPresetRules = validateRuntimeRules(message.rules);
            await vetoSDK.addLocalRules(validatedPresetRules);
            logger.info(`Preset activated: ${validatedPresetRules.length} rule(s)`);
            return port.postMessage({ type: 'policy_activated', ruleCount: validatedPresetRules.length });
          }

          case 'veto_list_rules': {
            const rules = vetoSDK.getLocalRules();
            return port.postMessage({ type: 'veto_rules_list', rules });
          }

          case 'veto_remove_rule': {
            if (!message.ruleId) {
              return port.postMessage({ type: 'error', error: 'Missing ruleId.' });
            }
            await vetoSDK.removeLocalRule(message.ruleId);
            const remaining = vetoSDK.getLocalRules();
            logger.info(`Rule removed: ${message.ruleId} (${remaining.length} remaining)`);
            return port.postMessage({ type: 'veto_rules_list', rules: remaining });
          }

          case 'veto_cycle_mode': {
            const config = await vetoStore.getVeto();
            const modes = ['strict', 'log', 'shadow'] as const;
            const currentIdx = modes.indexOf(config.mode as (typeof modes)[number]);
            const nextMode = modes[(currentIdx + 1) % modes.length];
            await vetoStore.updateVeto({ mode: nextMode });
            return port.postMessage({ type: 'veto_mode_changed', mode: nextMode });
          }

          default:
            return port.postMessage({
              type: 'error',
              error: t('errors_cmd_unknown', [(message as { type: string }).type]),
            });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : t('errors_unknown'),
        });
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('Side panel disconnected');
      if (currentPort === port) {
        currentPort = null;
      }
      vetoSDK.onApprovalNeeded = null;
      vetoSDK.onDecisionMade = null;
      // Keep pending policy preview and active executor alive so the run survives panel reconnects.
      // Pending approvals are rehydrated on reconnect and alarms still handle timeout.
    });
  }
});

async function setupExecutor(taskId: string, task: string, browserContext: BrowserContext) {
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error(t('bg_setup_noApiKeys'));
  }

  // Clean up any legacy validator settings for backward compatibility
  await agentModelStore.cleanupLegacyValidatorSettings();

  const agentModels = await agentModelStore.getAllAgentModels();
  // verify if every provider used in the agent models exists in the providers
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(t('bg_setup_noProvider', [agentModel.provider]));
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error(t('bg_setup_noNavigatorModel'));
  }
  // Log the provider config being used for the navigator
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    // Log the provider config being used for the planner
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  // Apply firewall settings to browser context
  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
    displayHighlights: generalSettings.displayHighlights,
  });

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      useVision: generalSettings.useVision,
      useVisionForPlanner: true,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
  });

  return executor;
}

// Update subscribeToExecutorEvents to use port
async function subscribeToExecutorEvents(executor: Executor) {
  // Clear previous event listeners to prevent multiple subscriptions
  executor.clearExecutionEvents();

  // Subscribe to new events
  executor.subscribeExecutionEvents(async event => {
    const runtimeEvent = await syncRuntimeFromEvent(event);

    try {
      if (currentPort) {
        currentPort.postMessage(runtimeEvent);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      event.state === ExecutionState.TASK_OK ||
      event.state === ExecutionState.TASK_FAIL ||
      event.state === ExecutionState.TASK_CANCEL
    ) {
      await currentExecutor?.cleanup();
      await taskRuntimeStore.clearActiveTask();
    }
  });
}
