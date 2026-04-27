import { useState } from 'react';
import '@src/Options.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { t } from '@extension/i18n';
import { FiSettings, FiCpu, FiShield, FiHelpCircle, FiLock, FiSliders } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { ModelSettings } from './components/ModelSettings';
import { FirewallSettings } from './components/FirewallSettings';
import { VetoSettings } from './components/VetoSettings';
import { PoliciesSettings } from './components/PoliciesSettings';

type TabId = 'general' | 'models' | 'policies' | 'firewall' | 'veto' | 'help';

const TABS: { id: TabId; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'models', icon: FiCpu, label: t('options_tabs_models') },
  { id: 'general', icon: FiSettings, label: t('options_tabs_general') },
  { id: 'policies', icon: FiSliders, label: 'Policies' },
  { id: 'veto', icon: FiLock, label: 'Veto Guard' },
  { id: 'firewall', icon: FiShield, label: t('options_tabs_firewall') },
  { id: 'help', icon: FiHelpCircle, label: t('options_tabs_help') },
];

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabId>('models');

  const handleTabClick = (tabId: TabId) => {
    if (tabId === 'help') {
      window.open('https://veto.so', '_blank');
    } else {
      setActiveTab(tabId);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'models':
        return <ModelSettings isDarkMode={true} />;
      case 'policies':
        return <PoliciesSettings />;
      case 'firewall':
        return <FirewallSettings />;
      case 'veto':
        return <VetoSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <nav
        className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="px-5 py-6">
          <div className="mb-1 flex items-center gap-2">
            <img src="/icon-128.png" alt="" className="size-5" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              veto-browse
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Settings
          </p>
        </div>

        <div className="flex-1 px-3">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                }}
                type="button">
                <tab.icon size={15} />
                <span>{tab.label}</span>
                {tab.id === 'help' && (
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    ↗
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            Protected by{' '}
            <a href="https://veto.so" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              Veto
            </a>
          </p>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-10">{renderContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
