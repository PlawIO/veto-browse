import { useState, useEffect, useCallback } from 'react';
import { vetoApi, type VetoConstraint, type VetoPolicy } from '@extension/storage';
import { c } from '../styles';

type PolicyEditorInput = {
  toolName?: unknown;
  mode?: unknown;
  constraints?: unknown;
  sessionConstraints?: unknown;
};

const BROWSER_TOOLS = [
  { name: 'browser_go_to_url', label: 'Navigate', desc: 'Controls which URLs the agent can visit' },
  { name: 'browser_click_element', label: 'Click', desc: 'Controls click actions on page elements' },
  { name: 'browser_input_text', label: 'Type text', desc: 'Controls what text the agent can enter' },
  { name: 'browser_search_google', label: 'Google search', desc: 'Controls search queries' },
  { name: 'browser_send_keys', label: 'Keyboard', desc: 'Controls keyboard input' },
  { name: 'browser_open_tab', label: 'Open tab', desc: 'Controls new tab creation' },
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const PoliciesSettings = () => {
  const [policies, setPolicies] = useState<VetoPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Quick-add state
  const [quickTool, setQuickTool] = useState('browser_go_to_url');
  const [quickType, setQuickType] = useState<'block-domain' | 'block-content' | 'limit-length'>('block-domain');
  const [quickValue, setQuickValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await vetoApi.listPolicies();
      setPolicies(data.filter(p => p.toolName.startsWith('browser_')));
    } catch (e) {
      setPolicies([]);
      setError(getErrorMessage(e, 'Failed to load policies'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleActivate = async (toolName: string, active: boolean) => {
    setError('');
    try {
      if (active) {
        await vetoApi.activatePolicy(toolName);
      } else {
        await vetoApi.deactivatePolicy(toolName);
      }
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to update policy'));
    }
  };

  const handleDelete = async (toolName: string) => {
    setError('');
    try {
      await vetoApi.deletePolicy(toolName);
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to delete policy'));
    }
  };

  const handleEdit = (policy: VetoPolicy) => {
    setEditing(policy.toolName);
    setEditJson(
      JSON.stringify(
        {
          toolName: policy.toolName,
          mode: policy.mode,
          constraints: policy.constraints,
          ...(policy.sessionConstraints ? { sessionConstraints: policy.sessionConstraints } : {}),
        },
        null,
        2,
      ),
    );
    setSaveMsg('');
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const parsed = JSON.parse(editJson) as PolicyEditorInput;
      if (parsed.toolName !== editing) {
        throw new Error('Policy toolName cannot be changed. Create a new policy for a different tool.');
      }
      if (typeof parsed.mode !== 'string') {
        throw new Error('Policy mode must be a string');
      }
      if (!Array.isArray(parsed.constraints)) {
        throw new Error('Policy constraints must be an array');
      }
      if (parsed.sessionConstraints !== undefined && !isRecord(parsed.sessionConstraints)) {
        throw new Error('Policy sessionConstraints must be an object');
      }

      const sessionConstraints = parsed.sessionConstraints as Record<string, unknown> | undefined;
      await vetoApi.updatePolicy(editing, {
        mode: parsed.mode,
        constraints: parsed.constraints as VetoConstraint[],
        sessionConstraints,
      });
      await vetoApi.activatePolicy(editing);
      setSaveMsg('Saved');
      await load();
      setTimeout(() => {
        setEditing(null);
      }, 600);
    } catch (e) {
      setSaveMsg(getErrorMessage(e, 'Failed to save policy'));
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickValue.trim()) return;
    setError('');
    try {
      let constraint: VetoConstraint;
      if (quickType === 'block-domain') {
        const domains = quickValue.split(',').map(d => d.trim().replace(/\./g, '\\.'));
        constraint = { argumentName: 'url', enabled: true, action: 'deny', notRegex: `(${domains.join('|')})` };
      } else if (quickType === 'block-content') {
        constraint = { argumentName: 'text', enabled: true, action: 'deny', notRegex: quickValue.trim() };
      } else {
        constraint = {
          argumentName: 'text',
          enabled: true,
          action: 'deny',
          maxLength: Number.parseInt(quickValue, 10) || 100,
        };
      }

      const existing = policies.find(p => p.toolName === quickTool);
      if (existing) {
        const merged = [...existing.constraints, constraint];
        await vetoApi.updatePolicy(quickTool, {
          mode: 'deterministic',
          constraints: merged,
          sessionConstraints: existing.sessionConstraints,
        });
      } else {
        await vetoApi.createPolicy({ toolName: quickTool, mode: 'deterministic', constraints: [constraint] });
      }
      await vetoApi.activatePolicy(quickTool);
      setQuickValue('');
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to add policy'));
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold" style={{ color: c.text }}>
        Policies
      </h1>
      <p className="mb-8 text-sm" style={{ color: c.textDim }}>
        Rules that control what the agent can do — managed on your Veto project
      </p>

      {error && (
        <div
          className="mb-6 px-4 py-3"
          style={{ background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.15)` }}>
          <p className="text-[12px]" style={{ color: c.danger }}>
            {error}
          </p>
        </div>
      )}

      {/* ── Quick add ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
          Quick Add Rule
        </h2>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={quickTool}
              onChange={e => setQuickTool(e.target.value)}
              className="px-3 py-2 text-[13px] outline-none"
              style={{ background: c.input, border: `1px solid ${c.border}`, color: c.text }}>
              {BROWSER_TOOLS.map(t => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={quickType}
              onChange={e => setQuickType(e.target.value as typeof quickType)}
              className="px-3 py-2 text-[13px] outline-none"
              style={{ background: c.input, border: `1px solid ${c.border}`, color: c.text }}>
              <option value="block-domain">Block domain</option>
              <option value="block-content">Block content (regex)</option>
              <option value="limit-length">Max length</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickValue}
              onChange={e => setQuickValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleQuickAdd();
              }}
              placeholder={
                quickType === 'block-domain'
                  ? 'facebook.com, twitter.com'
                  : quickType === 'block-content'
                    ? 'regex pattern'
                    : '100'
              }
              className="flex-1 px-3 py-2 text-[13px] outline-none"
              style={{ background: c.input, border: `1px solid ${c.border}`, color: c.text }}
            />
            <button
              type="button"
              onClick={handleQuickAdd}
              className="px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: c.accent }}>
              Add
            </button>
          </div>
        </div>
      </section>

      {/* ── Active policies ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
            Active Policies
          </h2>
          <button type="button" onClick={load} className="text-[11px]" style={{ color: c.accent }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-[13px]" style={{ color: c.textDim }}>
            Loading...
          </div>
        ) : policies.length === 0 ? (
          <div className="py-12 text-center text-[13px]" style={{ color: c.textDim }}>
            No browser policies. Use Quick Add above to create one.
          </div>
        ) : (
          <div className="space-y-px">
            {policies.map(p => (
              <div key={p.id} className="group" style={{ borderBottom: `1px solid ${c.border}` }}>
                <div className="flex items-center justify-between p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: p.isActive ? c.success : c.danger }}>
                        {p.isActive ? '●' : '○'}
                      </span>
                      <span className="text-[13px] font-medium" style={{ color: c.text }}>
                        {p.toolName}
                      </span>
                      <span className="text-[10px]" style={{ color: c.textDim }}>
                        v{p.version} · {p.mode}
                      </span>
                    </div>
                    {p.constraints
                      .filter(cc => cc.enabled)
                      .map((cc, i) => {
                        let desc = cc.argumentName + ': ';
                        if (cc.notRegex) desc += `block /${cc.notRegex}/`;
                        else if (cc.notEnum) desc += `block [${cc.notEnum.join(', ')}]`;
                        else if (cc.regex) desc += `match /${cc.regex}/`;
                        else if (cc.enum) desc += `allow [${cc.enum.join(', ')}]`;
                        else if (cc.maximum !== undefined) desc += `≤ ${cc.maximum}`;
                        else if (cc.maxLength !== undefined) desc += `max ${cc.maxLength} chars`;
                        else desc += JSON.stringify(cc).slice(0, 50);
                        return (
                          <div key={i} className="ml-5 text-[11px]" style={{ color: c.textSecondary }}>
                            {cc.action || 'deny'} · {desc}
                          </div>
                        );
                      })}
                  </div>
                  <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleActivate(p.toolName, !p.isActive)}
                      className="text-[11px]"
                      style={{ color: p.isActive ? c.warning : c.success }}>
                      {p.isActive ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(p)}
                      className="text-[11px]"
                      style={{ color: c.accent }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.toolName)}
                      className="text-[11px]"
                      style={{ color: c.danger }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Edit modal ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-lg" style={{ background: c.raised, border: `1px solid ${c.border}` }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: c.border }}>
              <span className="text-[13px] font-medium" style={{ color: c.text }}>
                {editing}
              </span>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[13px]"
                style={{ color: c.textDim }}>
                ✕
              </button>
            </div>
            <textarea
              value={editJson}
              onChange={e => setEditJson(e.target.value)}
              className="w-full p-4 font-mono text-[12px] leading-relaxed outline-none"
              style={{ background: c.input, color: c.text, minHeight: '300px', resize: 'vertical' }}
            />
            <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: c.border }}>
              <span className="text-[12px]" style={{ color: saveMsg === 'Saved' ? c.success : c.danger }}>
                {saveMsg}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-1.5 text-[13px]"
                  style={{ color: c.textSecondary, border: `1px solid ${c.border}` }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 text-[13px] font-medium text-white"
                  style={{ background: c.accent, opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'Saving...' : 'Save & Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
