import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

/** Actions that can be individually toggled */
export const BROWSER_ACTIONS = [
  'click_element',
  'input_text',
  'go_to_url',
  'search_google',
  'send_keys',
  'open_tab',
  'close_tab',
  'switch_tab',
  'scroll_to_text',
  'scroll_to_percent',
  'scroll_to_top',
  'scroll_to_bottom',
  'previous_page',
  'next_page',
  'go_back',
  'get_dropdown_options',
  'select_dropdown_option',
  'cache_content',
  'wait',
] as const;

export type BrowserAction = (typeof BROWSER_ACTIONS)[number];

export interface ContentFilter {
  id: string;
  label: string;
  pattern: string; // regex pattern
  enabled: boolean;
}

export interface LocalPoliciesConfig {
  enabled: boolean;

  /** Actions that are blocked — agent cannot use these at all */
  blockedActions: BrowserAction[];

  /** If non-empty, agent can ONLY navigate to these domains */
  allowedDomains: string[];

  /** Agent is blocked from navigating to these domains */
  blockedDomains: string[];

  /** Maximum actions the agent can take per task (0 = unlimited) */
  maxActionsPerTask: number;

  /** Maximum tabs the agent can open (0 = unlimited) */
  maxTabs: number;

  /** Regex patterns — if input_text content matches, it's blocked */
  contentFilters: ContentFilter[];
}

export type LocalPoliciesStorage = BaseStorage<LocalPoliciesConfig> & {
  update: (settings: Partial<LocalPoliciesConfig>) => Promise<void>;
  get: () => Promise<LocalPoliciesConfig>;
  resetToDefaults: () => Promise<void>;
};

export const DEFAULT_LOCAL_POLICIES: LocalPoliciesConfig = {
  enabled: true,
  blockedActions: [],
  allowedDomains: [],
  blockedDomains: [],
  maxActionsPerTask: 0,
  maxTabs: 0,
  contentFilters: [
    {
      id: 'credit-card',
      label: 'Credit card numbers',
      pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
      enabled: true,
    },
    {
      id: 'ssn',
      label: 'Social Security numbers',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      enabled: true,
    },
  ],
};

const storage = createStorage<LocalPoliciesConfig>('local-policies', DEFAULT_LOCAL_POLICIES, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const localPoliciesStore: LocalPoliciesStorage = {
  ...storage,
  async update(settings: Partial<LocalPoliciesConfig>) {
    const current = (await storage.get()) || DEFAULT_LOCAL_POLICIES;
    await storage.set({ ...current, ...settings });
  },
  async get() {
    return (await storage.get()) || DEFAULT_LOCAL_POLICIES;
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_LOCAL_POLICIES);
  },
};
