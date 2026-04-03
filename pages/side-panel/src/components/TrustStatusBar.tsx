import { memo } from 'react';

export interface TrustState {
  vetoMode: string | null;
  firewallSummary: string | null;
  sessionBlockCount: number;
}

interface TrustStatusBarProps {
  trustState: TrustState;
}

export default memo(function TrustStatusBar({ trustState }: TrustStatusBarProps) {
  const { vetoMode, firewallSummary, sessionBlockCount } = trustState;

  if (!vetoMode) return null;

  const modeLabel = vetoMode === 'strict' ? 'ON' : vetoMode === 'log' ? 'LOG' : 'SHD';
  const modeColor =
    vetoMode === 'strict' ? 'var(--success)' : vetoMode === 'log' ? 'var(--warning)' : 'var(--text-muted)';

  return (
    <div
      className="flex items-center gap-2 border-b px-3 py-1 text-[10px]"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        &#9632;
      </span>
      <span className="px-1 py-px text-[9px] font-bold text-white" style={{ backgroundColor: modeColor }}>
        {modeLabel}
      </span>
      {firewallSummary && <span style={{ color: 'var(--text-muted)' }}>{firewallSummary}</span>}
      <span className="flex-1" />
      {sessionBlockCount > 0 && <span style={{ color: 'var(--danger)' }}>{sessionBlockCount} blocked</span>}
    </div>
  );
});
