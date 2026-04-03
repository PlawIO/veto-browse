import { memo } from 'react';
import type { Turn } from '../types/turn';

interface SystemNoteProps {
  turn: Turn;
}

export default memo(function SystemNote({ turn }: SystemNoteProps) {
  return (
    <div className="my-2 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
      {turn.content}
    </div>
  );
});
