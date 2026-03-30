import { useState, useEffect, useCallback } from 'react';
import {
  localPoliciesStore,
  BROWSER_ACTIONS,
  type LocalPoliciesConfig,
  type BrowserAction,
  type ContentFilter,
} from '@extension/storage';
import { c } from '../styles';

const ACTION_LABELS: Record<string, string> = {
  click_element: 'Click',
  input_text: 'Type text',
  go_to_url: 'Navigate',
  search_google: 'Google search',
  send_keys: 'Keyboard input',
  open_tab: 'Open tab',
  close_tab: 'Close tab',
  switch_tab: 'Switch tab',
  scroll_to_text: 'Scroll to text',
  scroll_to_percent: 'Scroll %',
  scroll_to_top: 'Scroll top',
  scroll_to_bottom: 'Scroll bottom',
  previous_page: 'Page up',
  next_page: 'Page down',
  go_back: 'Go back',
  get_dropdown_options: 'Read dropdown',
  select_dropdown_option: 'Select dropdown',
  cache_content: 'Cache content',
  wait: 'Wait',
};

export const PoliciesSettings = () => {
  const [config, setConfig] = useState<LocalPoliciesConfig | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [domainMode, setDomainMode] = useState<'blocked' | 'allowed'>('blocked');
  const [newFilterLabel, setNewFilterLabel] = useState('');
  const [newFilterPattern, setNewFilterPattern] = useState('');

  const load = useCallback(async () => {
    setConfig(await localPoliciesStore.get());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<LocalPoliciesConfig>) => {
    await localPoliciesStore.update(patch);
    await load();
  };

  if (!config) return null;

  const toggleAction = (action: BrowserAction) => {
    const blocked = config.blockedActions.includes(action)
      ? config.blockedActions.filter(a => a !== action)
      : [...config.blockedActions, action];
    save({ blockedActions: blocked });
  };

  const addDomain = () => {
    const clean = newDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!clean) return;
    if (domainMode === 'blocked') {
      if (!config.blockedDomains.includes(clean)) {
        save({ blockedDomains: [...config.blockedDomains, clean] });
      }
    } else {
      if (!config.allowedDomains.includes(clean)) {
        save({ allowedDomains: [...config.allowedDomains, clean] });
      }
    }
    setNewDomain('');
  };

  const removeDomain = (domain: string, mode: 'blocked' | 'allowed') => {
    if (mode === 'blocked') {
      save({ blockedDomains: config.blockedDomains.filter(d => d !== domain) });
    } else {
      save({ allowedDomains: config.allowedDomains.filter(d => d !== domain) });
    }
  };

  const toggleFilter = (id: string) => {
    const filters = config.contentFilters.map(f => (f.id === id ? { ...f, enabled: !f.enabled } : f));
    save({ contentFilters: filters });
  };

  const removeFilter = (id: string) => {
    save({ contentFilters: config.contentFilters.filter(f => f.id !== id) });
  };

  const addFilter = () => {
    if (!newFilterLabel.trim() || !newFilterPattern.trim()) return;
    // Validate regex
    try {
      new RegExp(newFilterPattern);
    } catch {
      return;
    }
    const filter: ContentFilter = {
      id: `custom-${Date.now()}`,
      label: newFilterLabel.trim(),
      pattern: newFilterPattern.trim(),
      enabled: true,
    };
    save({ contentFilters: [...config.contentFilters, filter] });
    setNewFilterLabel('');
    setNewFilterPattern('');
  };

  const inputSt = { background: c.input, border: `1px solid ${c.border}`, color: c.text };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: c.text }}>
          Local Policies
        </h1>
        <button
          type="button"
          onClick={() => save({ enabled: !config.enabled })}
          className="text-[12px] font-medium"
          style={{ color: config.enabled ? c.success : c.danger }}>
          {config.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <p className="mb-8 text-sm" style={{ color: c.textDim }}>
        Client-side rules evaluated instantly, no server needed
      </p>

      {/* ── Action controls ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
          Action Controls
        </h2>
        <p className="mb-4 text-[12px]" style={{ color: c.textSecondary }}>
          Disabled actions cannot be used by the agent
        </p>
        <div className="grid grid-cols-3 gap-px" style={{ background: c.border }}>
          {BROWSER_ACTIONS.map(action => {
            const isBlocked = config.blockedActions.includes(action);
            return (
              <button
                key={action}
                type="button"
                onClick={() => toggleAction(action)}
                className="flex items-center justify-between px-3 py-2.5 text-[12px] transition-colors"
                style={{
                  background: isBlocked ? 'rgba(239, 68, 68, 0.06)' : c.raised,
                  color: isBlocked ? c.danger : c.text,
                }}>
                <span>{ACTION_LABELS[action] || action}</span>
                <span className="text-[10px]">{isBlocked ? 'OFF' : 'ON'}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Domain restrictions ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
          Domain Restrictions
        </h2>

        <div className="mb-4 flex" style={{ borderBottom: `1px solid ${c.border}` }}>
          {(['blocked', 'allowed'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setDomainMode(mode)}
              className="px-4 py-2 text-[13px] font-medium"
              style={{
                color: domainMode === mode ? c.accent : c.textSecondary,
                borderBottom: domainMode === mode ? `2px solid ${c.accent}` : '2px solid transparent',
              }}>
              {mode === 'blocked' ? 'Blocked' : 'Allowed only'}
            </button>
          ))}
        </div>

        <p className="mb-3 text-[12px]" style={{ color: c.textSecondary }}>
          {domainMode === 'blocked'
            ? 'Agent cannot navigate to these domains'
            : 'If set, agent can ONLY navigate to these domains'}
        </p>

        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addDomain();
            }}
            placeholder="example.com"
            className="flex-1 px-3 py-2 text-[13px] outline-none"
            style={inputSt}
          />
          <button
            type="button"
            onClick={addDomain}
            className="px-4 py-2 text-[13px] font-medium text-white"
            style={{ background: c.accent }}>
            Add
          </button>
        </div>

        {(domainMode === 'blocked' ? config.blockedDomains : config.allowedDomains).length > 0 ? (
          <div className="space-y-px">
            {(domainMode === 'blocked' ? config.blockedDomains : config.allowedDomains).map(d => (
              <div
                key={d}
                className="group flex items-center justify-between px-3 py-2 transition-colors hover:bg-[#191919]"
                style={{ borderBottom: `1px solid ${c.border}` }}>
                <span className="text-[13px]" style={{ color: c.text }}>
                  {d}
                </span>
                <button
                  type="button"
                  onClick={() => removeDomain(d, domainMode)}
                  className="text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: c.danger }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-[12px]" style={{ color: c.textDim }}>
            No domains configured
          </div>
        )}
      </section>

      {/* ── Task limits ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
          Task Limits
        </h2>
        <div style={{ borderTop: `1px solid ${c.border}` }}>
          <div className="flex items-center justify-between py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
            <div>
              <div className="text-[13px] font-medium" style={{ color: c.text }}>
                Max actions per task
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: c.textDim }}>
                0 = unlimited
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={500}
              value={config.maxActionsPerTask}
              onChange={e => save({ maxActionsPerTask: Number.parseInt(e.target.value, 10) || 0 })}
              className="w-20 px-3 py-1.5 text-[13px] outline-none"
              style={inputSt}
            />
          </div>
          <div className="flex items-center justify-between py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
            <div>
              <div className="text-[13px] font-medium" style={{ color: c.text }}>
                Max open tabs
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: c.textDim }}>
                0 = unlimited
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={20}
              value={config.maxTabs}
              onChange={e => save({ maxTabs: Number.parseInt(e.target.value, 10) || 0 })}
              className="w-20 px-3 py-1.5 text-[13px] outline-none"
              style={inputSt}
            />
          </div>
        </div>
      </section>

      {/* ── Content filters ── */}
      <section>
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
          Content Filters
        </h2>
        <p className="mb-4 text-[12px]" style={{ color: c.textSecondary }}>
          Block the agent from typing text that matches these patterns
        </p>

        {config.contentFilters.map(filter => (
          <div
            key={filter.id}
            className="group flex items-center justify-between py-3"
            style={{ borderBottom: `1px solid ${c.border}` }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleFilter(filter.id)}
                className="relative h-5 w-9 shrink-0 transition-colors"
                style={{ background: filter.enabled ? c.accent : '#333' }}>
                <span
                  className="absolute top-0.5 left-0.5 block size-4 bg-white transition-transform"
                  style={{ transform: filter.enabled ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
              <div>
                <div className="text-[13px]" style={{ color: c.text }}>
                  {filter.label}
                </div>
                <div className="text-[11px] font-mono" style={{ color: c.textDim }}>
                  {filter.pattern}
                </div>
              </div>
            </div>
            {!filter.id.startsWith('credit-card') && !filter.id.startsWith('ssn') && (
              <button
                type="button"
                onClick={() => removeFilter(filter.id)}
                className="text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: c.danger }}>
                Remove
              </button>
            )}
          </div>
        ))}

        {/* Add custom filter */}
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newFilterLabel}
              onChange={e => setNewFilterLabel(e.target.value)}
              placeholder="Label"
              className="flex-1 px-3 py-2 text-[13px] outline-none"
              style={inputSt}
            />
            <input
              type="text"
              value={newFilterPattern}
              onChange={e => setNewFilterPattern(e.target.value)}
              placeholder="Regex pattern"
              className="flex-1 px-3 py-2 font-mono text-[13px] outline-none"
              style={inputSt}
            />
            <button
              type="button"
              onClick={addFilter}
              className="px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: c.accent }}>
              Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
