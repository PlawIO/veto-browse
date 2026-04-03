import { memo } from 'react';
import type { Turn } from '../types/turn';
import { formatTimestamp } from '../utils';

interface UserTurnBlockProps {
  turn: Turn;
}

export default memo(function UserTurnBlock({ turn }: UserTurnBlockProps) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="group">
        <div
          className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-user)', color: 'var(--text-secondary)' }}>
          {turn.content}
        </div>
        <div
          className="mt-0.5 text-right text-xs opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--text-muted)' }}>
          {formatTimestamp(turn.timestamp)}
        </div>
      </div>
    </div>
  );
});
