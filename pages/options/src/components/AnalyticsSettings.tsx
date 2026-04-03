import { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';
import type { AnalyticsSettingsConfig } from '@extension/storage';
import { c } from '../styles';

export const AnalyticsSettings = () => {
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setSettings(await analyticsSettingsStore.getSettings());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    load();
    const unsub = analyticsSettingsStore.subscribe(load);
    return () => {
      unsub();
    };
  }, []);

  const toggle = async (enabled: boolean) => {
    if (!settings) return;
    await analyticsSettingsStore.updateSettings({ enabled });
    setSettings({ ...settings, enabled });
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold" style={{ color: c.text }}>
          Analytics
        </h1>
        <p className="mb-8 text-sm" style={{ color: c.textDim }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold" style={{ color: c.text }}>
          Analytics
        </h1>
        <p className="text-sm" style={{ color: c.danger }}>
          Failed to load settings.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold" style={{ color: c.text }}>
        Analytics
      </h1>
      <p className="mb-8 text-sm" style={{ color: c.textDim }}>
        Anonymous usage data to help improve the extension
      </p>

      {/* Toggle */}
      <div
        className="mb-8 flex items-center justify-between py-4"
        style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div>
          <div className="text-[13px] font-medium" style={{ color: c.text }}>
            Help improve veto-browse
          </div>
          <div className="mt-0.5 text-[12px]" style={{ color: c.textDim }}>
            Share anonymous usage data
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => toggle(!settings.enabled)}
          className="relative h-5 w-9 shrink-0 transition-colors"
          style={{ background: settings.enabled ? c.accent : '#333' }}>
          <span
            className="absolute left-0.5 top-0.5 block size-4 bg-white transition-transform"
            style={{ transform: settings.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Collected */}
        <div className="p-4" style={{ background: c.raised, border: `1px solid ${c.border}` }}>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
            Collected
          </h3>
          <div className="space-y-2 text-[12px]" style={{ color: c.textSecondary }}>
            {['Task execution metrics', 'Domain names (not URLs)', 'Error categories', 'Anonymous statistics'].map(
              item => (
                <div key={item} className="flex items-start gap-2">
                  <span className="mt-px text-[10px]" style={{ color: c.success }}>
                    ●
                  </span>
                  <span>{item}</span>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Not collected */}
        <div className="p-4" style={{ background: c.raised, border: `1px solid ${c.border}` }}>
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-widest" style={{ color: c.textDim }}>
            Never collected
          </h3>
          <div className="space-y-2 text-[12px]" style={{ color: c.textSecondary }}>
            {[
              'Personal info or credentials',
              'Full URLs or page content',
              'Task instructions or prompts',
              'Screenshots or recordings',
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-px text-[10px]" style={{ color: c.danger }}>
                  ●
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!settings.enabled && (
        <div
          className="mt-6 px-4 py-3"
          style={{ background: 'rgba(234, 179, 8, 0.06)', border: `1px solid rgba(234, 179, 8, 0.15)` }}>
          <p className="text-[12px]" style={{ color: c.warning }}>
            Analytics disabled. You can re-enable anytime.
          </p>
        </div>
      )}
    </div>
  );
};
