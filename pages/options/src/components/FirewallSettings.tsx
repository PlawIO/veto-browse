import { useState, useEffect, useCallback } from 'react';
import { firewallStore } from '@extension/storage';
import { t } from '@extension/i18n';
import { v, cardStyle, inputStyle, toggleTrackStyle } from '../styles';

interface FirewallSettingsProps {
  isDarkMode: boolean;
}

export const FirewallSettings = ({ isDarkMode }: FirewallSettingsProps) => {
  const s = v(isDarkMode);
  const [isEnabled, setIsEnabled] = useState(true);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [denyList, setDenyList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [activeList, setActiveList] = useState<'allow' | 'deny'>('allow');

  const loadSettings = useCallback(async () => {
    const settings = await firewallStore.getFirewall();
    setIsEnabled(settings.enabled);
    setAllowList(settings.allowList);
    setDenyList(settings.denyList);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggle = async () => {
    await firewallStore.updateFirewall({ enabled: !isEnabled });
    await loadSettings();
  };

  const handleAddUrl = async () => {
    const cleanUrl = newUrl.trim().replace(/^https?:\/\//, '');
    if (!cleanUrl) return;
    if (activeList === 'allow') await firewallStore.addToAllowList(cleanUrl);
    else await firewallStore.addToDenyList(cleanUrl);
    await loadSettings();
    setNewUrl('');
  };

  const handleRemoveUrl = async (url: string, listType: 'allow' | 'deny') => {
    if (listType === 'allow') await firewallStore.removeFromAllowList(url);
    else await firewallStore.removeFromDenyList(url);
    await loadSettings();
  };

  const currentList = activeList === 'allow' ? allowList : denyList;

  return (
    <section className="space-y-6">
      <div style={cardStyle(isDarkMode)}>
        <h2 className="mb-6 text-lg font-semibold" style={{ color: s.text }}>
          {t('options_firewall_header')}
        </h2>

        {/* Enable toggle */}
        <div
          className="mb-6 flex items-center justify-between p-4"
          style={{ backgroundColor: s.elevated, border: `1px solid ${s.border}` }}>
          <label htmlFor="toggle-firewall" className="text-sm font-medium" style={{ color: s.text }}>
            {t('options_firewall_enableToggle')}
          </label>
          <div className="relative inline-block w-12 select-none">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={handleToggle}
              className="sr-only"
              id="toggle-firewall"
            />
            <label
              htmlFor="toggle-firewall"
              className="block h-6 cursor-pointer overflow-hidden"
              style={toggleTrackStyle(isEnabled, isDarkMode)}>
              <span className="sr-only">{t('options_firewall_toggleFirewall_a11y')}</span>
              <span
                className="block size-6 bg-white shadow transition-transform"
                style={{ transform: isEnabled ? 'translateX(24px)' : 'translateX(0)' }}
              />
            </label>
          </div>
        </div>

        {/* List tabs */}
        <div className="mb-4 flex gap-0">
          {(['allow', 'deny'] as const).map(list => (
            <button
              key={list}
              onClick={() => setActiveList(list)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeList === list ? s.accent : 'transparent',
                color: activeList === list ? '#fff' : s.textSecondary,
                border: `1px solid ${activeList === list ? s.accent : s.border}`,
              }}
              type="button">
              {list === 'allow' ? t('options_firewall_allowList_header') : t('options_firewall_denyList_header')}
            </button>
          ))}
        </div>

        {/* Add URL */}
        <div className="mb-4 flex gap-2">
          <input
            id="url-input"
            type="text"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddUrl();
            }}
            placeholder={t('options_firewall_placeholders_domainUrl')}
            className="flex-1 px-3 py-2 text-sm"
            style={inputStyle(isDarkMode)}
          />
          <button
            onClick={handleAddUrl}
            className="px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: s.accent }}
            type="button">
            {t('options_firewall_btnAdd')}
          </button>
        </div>

        {/* URL list */}
        <div className="max-h-64 overflow-y-auto">
          {currentList.length > 0 ? (
            <div className="space-y-1">
              {currentList.map(url => (
                <div
                  key={url}
                  className="flex items-center justify-between p-2"
                  style={{ backgroundColor: s.elevated, border: `1px solid ${s.border}` }}>
                  <span className="text-sm" style={{ color: s.text }}>
                    {url}
                  </span>
                  <button
                    onClick={() => handleRemoveUrl(url, activeList)}
                    className="px-2 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: isDarkMode ? '#7f1d1d' : '#DC2626' }}
                    type="button">
                    {t('options_firewall_btnRemove')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: s.textMuted }}>
              {activeList === 'allow' ? t('options_firewall_allowList_empty') : t('options_firewall_denyList_empty')}
            </p>
          )}
        </div>
      </div>

      {/* How it works */}
      <div style={cardStyle(isDarkMode)}>
        <h2 className="mb-4 text-base font-semibold" style={{ color: s.text }}>
          {t('options_firewall_howItWorks_header')}
        </h2>
        <ul className="list-none space-y-2 text-sm" style={{ color: s.textSecondary }}>
          {t('options_firewall_howItWorks')
            .split('\n')
            .map((rule, index) => (
              <li key={index} className="flex gap-2">
                <span style={{ color: s.accent }}>—</span>
                {rule}
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
};
