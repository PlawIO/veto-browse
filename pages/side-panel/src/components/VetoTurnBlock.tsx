import { memo } from 'react';
import type { Turn } from '../types/turn';
import { TurnStatus } from '../types/turn';
import { formatTimestamp } from '../utils';
import StepDisclosure from './StepDisclosure';
import VetoEventInline from './VetoEventInline';

interface VetoTurnBlockProps {
  turn: Turn;
}

export default memo(function VetoTurnBlock({ turn }: VetoTurnBlockProps) {
  const isFailed = turn.status === TurnStatus.FAILED;
  const isCancelled = turn.status === TurnStatus.CANCELLED;

  return (
    <div className="mt-3 flex max-w-full gap-3 first:mt-0">
      <div className="flex size-7 shrink-0 items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
        <img src="icons/planner.svg" alt="Veto" className="size-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Veto
        </div>

        <div className="group space-y-1.5">
          {turn.isProgress && !turn.content && (
            <div className="h-0.5 overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="h-full animate-progress rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            </div>
          )}

          {turn.content && (
            <div
              className="whitespace-pre-wrap break-words text-sm"
              style={{ color: isFailed ? 'var(--danger)' : 'var(--text-primary)' }}>
              {turn.content}
            </div>
          )}

          {turn.vetoEvents.length > 0 &&
            turn.vetoEvents.map((evt, i) => <VetoEventInline key={`${evt.timestamp}-${i}`} event={evt} />)}

          {turn.steps.length > 0 && <StepDisclosure steps={turn.steps} isActive={turn.status === TurnStatus.ACTIVE} />}

          {!turn.isProgress && turn.content && (
            <div
              className="text-right text-xs opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}>
              {isCancelled && 'Cancelled · '}
              {formatTimestamp(turn.timestamp)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
