import { memo } from 'react';

export interface ActiveRule {
  id: string;
  name: string;
  description?: string;
  severity: string;
  action: string;
  enabled: boolean;
}

interface ActiveRulesPanelProps {
  rules: ActiveRule[];
  onRemove: (ruleId: string) => void;
}

const ACTION_COLORS: Record<string, string> = {
  block: 'var(--danger)',
  require_approval: 'var(--warning)',
  warn: '#eab308',
  log: 'var(--text-muted)',
};

export default memo(function ActiveRulesPanel({ rules, onRemove }: ActiveRulesPanelProps) {
  if (rules.length === 0) return null;

  return (
    <div className="m-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
          Active rules ({rules.length})
        </span>
      </div>
      <div className="space-y-1">
        {rules.map(rule => (
          <div
            key={rule.id}
            className="group flex items-center gap-2 border px-2 py-1.5"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface)' }}>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: ACTION_COLORS[rule.action] ?? 'var(--text-muted)' }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {rule.name}
              </div>
              {rule.description && (
                <div className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {rule.description}
                </div>
              )}
            </div>
            <span
              className="shrink-0 px-1 py-0.5 text-[9px] font-semibold uppercase"
              style={{ color: ACTION_COLORS[rule.action] ?? 'var(--text-muted)' }}>
              {rule.action.replace(/_/g, ' ')}
            </span>
            <button
              type="button"
              onClick={() => onRemove(rule.id)}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}
              title="Remove rule">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
