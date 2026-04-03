import { memo } from 'react';
import type { VetoEvent } from '../types/turn';

interface VetoEventInlineProps {
  event: VetoEvent;
}

export default memo(function VetoEventInline({ event }: VetoEventInlineProps) {
  const isBlock = event.type === 'blocked';

  return (
    <div
      className="flex items-start gap-1.5 px-2 py-1 text-[11px]"
      style={{
        backgroundColor: isBlock ? 'rgba(220, 38, 38, 0.08)' : 'rgba(245, 158, 11, 0.08)',
        color: isBlock ? 'var(--danger)' : 'var(--warning)',
      }}>
      <span className="shrink-0">&#9632;</span>
      <span className="min-w-0 break-words">
        {isBlock ? 'Blocked' : 'Would block'}: {event.toolName} &mdash; {event.reason}
      </span>
    </div>
  );
});
