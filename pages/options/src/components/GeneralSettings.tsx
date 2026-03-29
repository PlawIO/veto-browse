import { useState, useEffect } from 'react';
import { type GeneralSettingsConfig, generalSettingsStore, DEFAULT_GENERAL_SETTINGS } from '@extension/storage';
import { t } from '@extension/i18n';
import { v, cardStyle, inputStyle, toggleTrackStyle } from '../styles';

interface GeneralSettingsProps {
  isDarkMode?: boolean;
}

export const GeneralSettings = ({ isDarkMode = false }: GeneralSettingsProps) => {
  const s = v(isDarkMode);
  const [settings, setSettings] = useState<GeneralSettingsConfig>(DEFAULT_GENERAL_SETTINGS);

  useEffect(() => {
    generalSettingsStore.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await generalSettingsStore.updateSettings({ [key]: value } as Partial<GeneralSettingsConfig>);
    const latest = await generalSettingsStore.getSettings();
    setSettings(latest);
  };

  const NumberRow = ({
    id,
    label,
    desc,
    min,
    max,
    step,
    value,
    onChange,
  }: {
    id: string;
    label: string;
    desc: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${s.border}` }}>
      <div>
        <h3 className="text-sm font-medium" style={{ color: s.text }}>
          {label}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: s.textMuted }}>
          {desc}
        </p>
      </div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number.parseInt(e.target.value, 10))}
        className="w-20 px-3 py-2 text-sm"
        style={inputStyle(isDarkMode)}
      />
    </div>
  );

  const ToggleRow = ({
    id,
    label,
    desc,
    checked,
    onChange,
  }: {
    id: string;
    label: string;
    desc: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${s.border}` }}>
      <div>
        <h3 className="text-sm font-medium" style={{ color: s.text }}>
          {label}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: s.textMuted }}>
          {desc}
        </p>
      </div>
      <div className="relative inline-block w-12 select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only"
        />
        <label
          htmlFor={id}
          className="block h-6 cursor-pointer overflow-hidden"
          style={toggleTrackStyle(checked, isDarkMode)}>
          <span className="sr-only">{label}</span>
          <span
            className="block size-6 bg-white shadow transition-transform"
            style={{ transform: checked ? 'translateX(24px)' : 'translateX(0)' }}
          />
        </label>
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <div style={cardStyle(isDarkMode)}>
        <h2 className="mb-6 text-lg font-semibold" style={{ color: s.text }}>
          {t('options_general_header')}
        </h2>

        <div>
          <NumberRow
            id="maxSteps"
            label={t('options_general_maxSteps')}
            desc={t('options_general_maxSteps_desc')}
            min={1}
            max={50}
            value={settings.maxSteps}
            onChange={v => updateSetting('maxSteps', v)}
          />
          <NumberRow
            id="maxActionsPerStep"
            label={t('options_general_maxActions')}
            desc={t('options_general_maxActions_desc')}
            min={1}
            max={50}
            value={settings.maxActionsPerStep}
            onChange={v => updateSetting('maxActionsPerStep', v)}
          />
          <NumberRow
            id="maxFailures"
            label={t('options_general_maxFailures')}
            desc={t('options_general_maxFailures_desc')}
            min={1}
            max={10}
            value={settings.maxFailures}
            onChange={v => updateSetting('maxFailures', v)}
          />
          <ToggleRow
            id="useVision"
            label={t('options_general_enableVision')}
            desc={t('options_general_enableVision_desc')}
            checked={settings.useVision}
            onChange={v => updateSetting('useVision', v)}
          />
          <ToggleRow
            id="displayHighlights"
            label={t('options_general_displayHighlights')}
            desc={t('options_general_displayHighlights_desc')}
            checked={settings.displayHighlights}
            onChange={v => updateSetting('displayHighlights', v)}
          />
          <NumberRow
            id="planningInterval"
            label={t('options_general_planningInterval')}
            desc={t('options_general_planningInterval_desc')}
            min={1}
            max={20}
            value={settings.planningInterval}
            onChange={v => updateSetting('planningInterval', v)}
          />
          <NumberRow
            id="minWaitPageLoad"
            label={t('options_general_minWaitPageLoad')}
            desc={t('options_general_minWaitPageLoad_desc')}
            min={250}
            max={5000}
            step={50}
            value={settings.minWaitPageLoad}
            onChange={v => updateSetting('minWaitPageLoad', v)}
          />
          <ToggleRow
            id="replayHistoricalTasks"
            label={t('options_general_replayHistoricalTasks')}
            desc={t('options_general_replayHistoricalTasks_desc')}
            checked={settings.replayHistoricalTasks}
            onChange={v => updateSetting('replayHistoricalTasks', v)}
          />
        </div>
      </div>
    </section>
  );
};
