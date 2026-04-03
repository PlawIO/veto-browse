import { Actors } from '../chat/types';

export { Actors };

export enum EventType {
  EXECUTION = 'execution',
}

export enum ExecutionState {
  TASK_START = 'task.start',
  TASK_OK = 'task.ok',
  TASK_FAIL = 'task.fail',
  TASK_PAUSE = 'task.pause',
  TASK_RESUME = 'task.resume',
  TASK_CANCEL = 'task.cancel',

  STEP_START = 'step.start',
  STEP_OK = 'step.ok',
  STEP_FAIL = 'step.fail',
  STEP_CANCEL = 'step.cancel',

  ACT_START = 'act.start',
  ACT_OK = 'act.ok',
  ACT_FAIL = 'act.fail',
}

export enum RuntimeTaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface EventData {
  taskId: string;
  step: number;
  maxSteps: number;
  details: string;
}

export interface AgentEvent {
  actor: Actors;
  state: ExecutionState;
  data: EventData;
  timestamp: number;
  type: EventType;
}

export interface RuntimeExecutionEvent extends AgentEvent {
  eventId: string;
}

export interface TrustSignal {
  id: string;
  taskId: string;
  message: string;
  timestamp: number;
}

export interface VerificationResult {
  taskId: string;
  passed: boolean;
  reason: string;
  timestamp: number;
}

export interface ContentRuntimeSnapshot {
  tabId: number;
  url: string;
  title: string;
  ready: boolean;
  visibilityState: DocumentVisibilityState | 'unknown';
  focusedTagName: string | null;
  interactiveElementCount: number;
  lastMutationAt: number | null;
  observedAt: number;
}

export interface ActiveTaskRuntimeState {
  taskId: string;
  task: string;
  tabId: number | null;
  status: RuntimeTaskStatus;
  startedAt: number;
  updatedAt: number;
  events: RuntimeExecutionEvent[];
  trustSignals: TrustSignal[];
  verification: VerificationResult | null;
  contentRuntime: ContentRuntimeSnapshot | null;
}

export interface TaskRuntimeState {
  activeTask: ActiveTaskRuntimeState | null;
}

export interface RuntimeSnapshotMessage {
  type: 'runtime_snapshot';
  snapshot: TaskRuntimeState;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export interface HeartbeatAckMessage {
  type: 'heartbeat_ack';
}

export interface SuccessMessage {
  type: 'success';
  msg?: string;
  screenshot?: string | null;
}

export interface SpeechToTextResultMessage {
  type: 'speech_to_text_result';
  text: string;
}

export interface SpeechToTextErrorMessage {
  type: 'speech_to_text_error';
  error: string;
}

export interface VetoDecisionMessage {
  type: 'veto_decision';
  allowed: boolean;
  decision?: string;
  reason?: string;
  toolName?: string;
  latencyMs?: number;
  ruleId?: string;
}

export interface VetoApprovalRequestMessage {
  type: 'veto_approval_request';
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason?: string;
  ruleId?: string;
}

export interface VetoModeChangedMessage {
  type: 'veto_mode_changed';
  mode: string;
}

export interface PolicyGeneratingMessage {
  type: 'policy_generating';
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  severity: string;
  action: string;
  tools?: string[];
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
  condition_groups?: Array<Array<{ field: string; operator: string; value: unknown }>>;
}

export interface PolicyPreviewMessage {
  type: 'policy_preview';
  rules: PolicyRule[];
  explanation: string;
  nonce: string;
}

export interface PolicyClarificationMessage {
  type: 'policy_clarification';
  explanation: string;
  questions: string[];
  nonce: string;
}

export interface PolicyActivatedMessage {
  type: 'policy_activated';
  ruleCount: number;
}

export interface PolicyCancelledMessage {
  type: 'policy_cancelled';
}

export interface VetoRulesListMessage {
  type: 'veto_rules_list';
  rules: Array<{
    id: string;
    name: string;
    description?: string;
    severity: string;
    action: string;
    enabled: boolean;
  }>;
}

export interface TrustSignalMessage {
  type: 'trust_signal';
  taskId: string;
  content: string;
  timestamp: number;
}

export type BackgroundToSidePanelMessage =
  | RuntimeExecutionEvent
  | RuntimeSnapshotMessage
  | ErrorMessage
  | HeartbeatAckMessage
  | SuccessMessage
  | SpeechToTextResultMessage
  | SpeechToTextErrorMessage
  | VetoDecisionMessage
  | VetoApprovalRequestMessage
  | VetoModeChangedMessage
  | PolicyGeneratingMessage
  | PolicyPreviewMessage
  | PolicyClarificationMessage
  | PolicyActivatedMessage
  | PolicyCancelledMessage
  | TrustSignalMessage
  | VetoRulesListMessage;

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export interface RuntimeSnapshotRequestMessage {
  type: 'runtime_snapshot_request';
}

export interface NewTaskMessage {
  type: 'new_task';
  task: string;
  taskId: string;
  tabId: number;
}

export interface FollowUpTaskMessage {
  type: 'follow_up_task';
  task: string;
  taskId: string;
  tabId: number;
}

export interface CancelTaskMessage {
  type: 'cancel_task';
}

export interface ResumeTaskMessage {
  type: 'resume_task';
}

export interface PauseTaskMessage {
  type: 'pause_task';
}

export interface ScreenshotMessage {
  type: 'screenshot';
  tabId: number;
}

export interface StateMessage {
  type: 'state';
}

export interface NoHighlightMessage {
  type: 'nohighlight';
}

export interface SpeechToTextMessage {
  type: 'speech_to_text';
  audio: string;
}

export interface ReplayMessage {
  type: 'replay';
  taskId: string;
  tabId: number;
  historySessionId: string;
  task: string;
}

export interface VetoApprovalResponseMessage {
  type: 'veto_approval_response';
  approvalId: string;
  decision: 'approve' | 'deny';
}

export interface PolicyActivateMessage {
  type: 'policy_activate';
  nonce?: string;
}

export interface PolicyClarificationResponseMessage {
  type: 'policy_clarification_response';
  answer: string;
  nonce?: string;
}

export interface PolicyCancelMessage {
  type: 'policy_cancel';
}

export interface VetoPresetActivateMessage {
  type: 'veto_preset_activate';
  rules: Record<string, unknown>[];
}

export interface VetoListRulesMessage {
  type: 'veto_list_rules';
}

export interface VetoRemoveRuleMessage {
  type: 'veto_remove_rule';
  ruleId: string;
}

export interface VetoCycleModeMessage {
  type: 'veto_cycle_mode';
}

export type SidePanelToBackgroundMessage =
  | HeartbeatMessage
  | RuntimeSnapshotRequestMessage
  | NewTaskMessage
  | FollowUpTaskMessage
  | CancelTaskMessage
  | ResumeTaskMessage
  | PauseTaskMessage
  | ScreenshotMessage
  | StateMessage
  | NoHighlightMessage
  | SpeechToTextMessage
  | ReplayMessage
  | VetoApprovalResponseMessage
  | PolicyActivateMessage
  | PolicyClarificationResponseMessage
  | PolicyCancelMessage
  | VetoPresetActivateMessage
  | VetoListRulesMessage
  | VetoRemoveRuleMessage
  | VetoCycleModeMessage;

export interface ContentRuntimeReadyMessage {
  type: 'content_runtime_ready';
  payload: ContentRuntimeSnapshot;
}

export interface ContentRuntimeUpdateMessage {
  type: 'content_runtime_update';
  payload: ContentRuntimeSnapshot;
}

export type ContentRuntimeMessage = ContentRuntimeReadyMessage | ContentRuntimeUpdateMessage;
