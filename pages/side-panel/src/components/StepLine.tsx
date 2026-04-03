import { memo } from 'react';
import { Actors } from '@extension/storage';
import type { TurnStep } from '../types/turn';

const ACTOR_BADGE: Record<string, string> = {
  [Actors.PLANNER]: 'P',
  [Actors.NAVIGATOR]: 'N',
  [Actors.VALIDATOR]: 'V',
};

interface StepLineProps {
  step: TurnStep;
}

export default memo(function StepLine({ step }: StepLineProps) {
  const badge = ACTOR_BADGE[step.actor] || '?';
  const time = new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="flex items-start gap-1.5 text-[11px] leading-relaxed"
      style={{
        color: step.isError ? 'var(--danger)' : 'var(--text-muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center text-[9px] font-bold"
        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
        {badge}
      </span>
      <span className="min-w-0 flex-1 break-words">{step.content}</span>
      <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {time}
      </span>
    </div>
  );
});
