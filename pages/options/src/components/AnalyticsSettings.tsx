import React, { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';
import type { AnalyticsSettingsConfig } from '@extension/storage';
import { v, cardStyle, toggleTrackStyle } from '../styles';

interface AnalyticsSettingsProps {
  isDarkMode: boolean;
}

export const AnalyticsSettings: React.FC<AnalyticsSettingsProps> = ({ isDarkMode }) => {
  const s = v(isDarkMode);
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const current = await analyticsSettingsStore.getSettings();
        setSettings(current);
      } catch (error) {
        console.error('Failed to load analytics settings:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
    const unsubscribe = analyticsSettingsStore.subscribe(loadSettings);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggle = async (enabled: boolean) => {
    if (!settings) return;
    await analyticsSettingsStore.updateSettings({ enabled });
    setSettings({ ...settings, enabled });
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div style={cardStyle(isDarkMode)}>
          <h2 className="mb-4 text-lg font-semibold" style={{ color: s.text }}>
            Analytics
          </h2>
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-3/4" style={{ backgroundColor: s.elevated }} />
            <div className="h-4 w-1/2" style={{ backgroundColor: s.elevated }} />
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-6">
        <div style={cardStyle(isDarkMode)}>
          <h2 className="mb-4 text-lg font-semibold" style={{ color: s.text }}>
            Analytics
          </h2>
          <p style={{ color: s.danger }}>Failed to load analytics settings.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div style={cardStyle(isDarkMode)}>
        <h2 className="mb-6 text-lg font-semibold" style={{ color: s.text }}>
          Analytics
        </h2>

        {/* Toggle */}
        <div
          className="mb-6 flex items-center justify-between p-4"
          style={{ backgroundColor: s.elevated, border: `1px solid ${s.border}` }}>
          <div>
            <label htmlFor="analytics-enabled" className="text-sm font-medium" style={{ color: s.text }}>
              Help improve Nanobrowser
            </label>
            <p className="mt-0.5 text-xs" style={{ color: s.textMuted }}>
              Share anonymous usage data to help us improve
            </p>
          </div>
          <div className="relative inline-block w-12 select-none">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => handleToggle(e.target.checked)}
              className="sr-only"
              id="analytics-enabled"
            />
            <label
              htmlFor="analytics-enabled"
              className="block h-6 cursor-pointer overflow-hidden"
              style={toggleTrackStyle(settings.enabled, isDarkMode)}>
              <span className="sr-only">Toggle analytics</span>
              <span
                className="block size-6 bg-white shadow transition-transform"
                style={{ transform: settings.enabled ? 'translateX(24px)' : 'translateX(0)' }}
              />
            </label>
          </div>
        </div>

        {/* What we collect */}
        <div className="space-y-4">
          <div className="p-4" style={{ backgroundColor: s.elevated, border: `1px solid ${s.border}` }}>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: s.textMuted }}>
              Collected
            </h3>
            <ul className="list-none space-y-2 text-sm" style={{ color: s.textSecondary }}>
              <li className="flex gap-2">
                <span style={{ color: s.success }}>+</span> Task execution metrics (counts, duration)
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.success }}>+</span> Domain names visited (not full URLs)
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.success }}>+</span> Error categories (no sensitive details)
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.success }}>+</span> Anonymous usage statistics
              </li>
            </ul>
          </div>

          <div className="p-4" style={{ backgroundColor: s.elevated, border: `1px solid ${s.border}` }}>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: s.textMuted }}>
              Never collected
            </h3>
            <ul className="list-none space-y-2 text-sm" style={{ color: s.textSecondary }}>
              <li className="flex gap-2">
                <span style={{ color: s.danger }}>—</span> Personal information or credentials
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.danger }}>—</span> Full URLs or page content
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.danger }}>—</span> Task instructions or prompts
              </li>
              <li className="flex gap-2">
                <span style={{ color: s.danger }}>—</span> Screenshots or recordings
              </li>
            </ul>
          </div>
        </div>

        {/* Opt-out notice */}
        {!settings.enabled && (
          <div
            className="mt-4 p-3"
            style={{
              backgroundColor: isDarkMode ? '#1a1a0d' : '#fffbeb',
              border: `1px solid ${isDarkMode ? '#2e2e1f' : '#fde68a'}`,
            }}>
            <p className="text-sm" style={{ color: s.warning }}>
              Analytics disabled. Re-enable anytime to help improve Nanobrowser.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
