import { memo } from 'react';
import type { TurnStep } from '../types/turn';
import StepLine from './StepLine';

interface StepDisclosureProps {
  steps: TurnStep[];
  isActive: boolean;
}

export default memo(function StepDisclosure({ steps, isActive }: StepDisclosureProps) {
  const label = isActive
    ? `${steps.length} step${steps.length !== 1 ? 's' : ''}...`
    : `${steps.length} step${steps.length !== 1 ? 's' : ''}`;

  return (
    <details className="step-disclosure">
      <summary className="cursor-pointer select-none list-none text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span className="step-disclosure-chevron">&#9656;</span> {label}
      </summary>
      <div className="step-disclosure-content">
        <div className="space-y-0.5 border-l py-1 pl-2" style={{ borderColor: 'var(--border-subtle)' }}>
          {steps.map((step, i) => (
            <StepLine key={`${step.timestamp}-${i}`} step={step} />
          ))}
        </div>
      </div>
    </details>
  );
});
