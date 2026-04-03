import { Actors, type Message } from '@extension/storage';
import { type Turn, type TurnStep, type VetoEvent, TurnStatus } from '../types/turn';

const PROGRESS_SENTINEL = 'Showing progress...';

function parseVetoBlock(content: string): VetoEvent | null {
  const blockedMatch = content.match(/^\[Veto\] Blocked:\s*(.+?)\s*\u2014\s*(.+)$/);
  if (blockedMatch) {
    return { type: 'blocked', toolName: blockedMatch[1], reason: blockedMatch[2], timestamp: 0 };
  }
  const wouldBlockMatch = content.match(/^\[Veto\] Would block:\s*(.+?)\s*\u2014\s*(.+)$/);
  if (wouldBlockMatch) {
    return { type: 'would_block', toolName: wouldBlockMatch[1], reason: wouldBlockMatch[2], timestamp: 0 };
  }
  return null;
}

function isAgentActor(actor: string): boolean {
  return actor === Actors.PLANNER || actor === Actors.NAVIGATOR || actor === Actors.VALIDATOR;
}

function makeVetoTurn(timestamp: number): Turn {
  return {
    id: `veto-${timestamp}`,
    role: 'veto',
    content: '',
    timestamp,
    status: TurnStatus.ACTIVE,
    steps: [],
    vetoEvents: [],
    isProgress: false,
  };
}

export function buildTurnsFromMessages(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  // Using an array with a single element to work around TypeScript's
  // inability to track closure mutations on let-bound variables.
  const state: { current: Turn | null } = { current: null };

  function flush() {
    const t = state.current;
    if (t && (t.content || t.steps.length > 0 || t.isProgress)) {
      turns.push(t);
    }
    state.current = null;
  }

  function ensure(timestamp: number): Turn {
    if (!state.current) {
      state.current = makeVetoTurn(timestamp);
    }
    return state.current;
  }

  for (const msg of messages) {
    const { actor, content, timestamp } = msg;

    // --- Progress sentinel ---
    if (content === PROGRESS_SENTINEL) {
      if (isAgentActor(actor)) {
        ensure(timestamp).isProgress = true;
      }
      continue;
    }

    // --- USER messages ---
    if (actor === Actors.USER) {
      flush();
      turns.push({
        id: `user-${timestamp}`,
        role: 'user',
        content,
        timestamp,
        status: TurnStatus.COMPLETE,
        steps: [],
        vetoEvents: [],
        isProgress: false,
      });
      continue;
    }

    // --- SYSTEM messages ---
    if (actor === Actors.SYSTEM) {
      // Trust guardrails → skip (handled by TrustStatusBar)
      if (content.startsWith('Trust guardrails:')) {
        continue;
      }

      // Veto block/warn → inline in current veto turn
      const vetoEvent = parseVetoBlock(content);
      if (vetoEvent) {
        vetoEvent.timestamp = timestamp;
        ensure(timestamp).vetoEvents.push(vetoEvent);
        continue;
      }

      // Task failure/cancel from system
      if (content.startsWith('Task failed:') || content.startsWith('Task cancelled')) {
        const t = state.current;
        if (t) {
          t.status = content.startsWith('Task failed:') ? TurnStatus.FAILED : TurnStatus.CANCELLED;
          if (!t.content) t.content = content;
          flush();
        } else {
          turns.push({
            id: `system-${timestamp}`,
            role: 'system',
            content,
            timestamp,
            status: TurnStatus.FAILED,
            steps: [],
            vetoEvents: [],
            isProgress: false,
          });
        }
        continue;
      }

      // Policy/error/other system messages → inline system note
      flush();
      turns.push({
        id: `system-${timestamp}`,
        role: 'system',
        content,
        timestamp,
        status: TurnStatus.COMPLETE,
        steps: [],
        vetoEvents: [],
        isProgress: false,
      });
      continue;
    }

    // --- PLANNER / NAVIGATOR / VALIDATOR messages ---
    if (isAgentActor(actor)) {
      const turn = ensure(timestamp);
      turn.isProgress = false;

      const isError =
        content.startsWith('Navigation failed:') ||
        content.startsWith('LLM returned invalid') ||
        content.includes('error') ||
        content.includes('failed');

      const step: TurnStep = { actor: actor as Actors, content, timestamp, isError };
      turn.steps.push(step);

      // First planner output becomes the turn's primary content
      if (actor === Actors.PLANNER && !turn.content) {
        turn.content = content;
      }

      // Validator "Completion verified" signals completion
      if (actor === Actors.VALIDATOR && content.toLowerCase().includes('verified')) {
        turn.status = TurnStatus.COMPLETE;
      }

      continue;
    }
  }

  flush();
  return turns;
}
