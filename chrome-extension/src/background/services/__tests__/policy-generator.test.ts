import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChangeListener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void | Promise<void>;

function createChromeStub(initialState: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(initialState));
  const listeners = new Set<ChangeListener>();

  const localArea = {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (!keys) {
        return Object.fromEntries(store.entries());
      }

      if (typeof keys === 'string') {
        return store.has(keys) ? { [keys]: store.get(keys) } : {};
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter(key => store.has(key)).map(key => [key, store.get(key)]));
      }

      return Object.fromEntries(Object.keys(keys).map(key => [key, store.has(key) ? store.get(key) : keys[key]]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, value]) => {
          const oldValue = store.get(key);
          store.set(key, value);
          return [key, { oldValue, newValue: value }];
        }),
      );

      for (const listener of listeners) {
        await listener(changes);
      }
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        store.delete(key);
      }
    }),
    onChanged: {
      addListener: vi.fn((listener: ChangeListener) => {
        listeners.add(listener);
      }),
    },
  };

  return {
    chrome: {
      storage: {
        local: localArea,
      },
    } as unknown as typeof chrome,
  };
}

describe('policy-generator helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    const { chrome } = createChromeStub();
    vi.stubGlobal('chrome', chrome);
  });

  it('pins authenticated policy generation to the hosted Veto endpoint', async () => {
    const { resolvePolicyGenerationEndpoint } = await import('../policy-generator');

    expect(resolvePolicyGenerationEndpoint('https://evil.example', true)).toBe('https://api.veto.so');
    expect(resolvePolicyGenerationEndpoint('https://self-hosted.example', false)).toBe('https://self-hosted.example');
  });

  it('asks for clarification when a policy needs unsupported redirect behavior and aggregate social timing', async () => {
    const { reviewPolicyRequest } = await import('../policy-generator');

    const clarification = reviewPolicyRequest(
      'If I have spent more than 3 mins on social media today, block all social tabs and redirect me to my task list.',
    );

    expect(clarification).not.toBeNull();
    expect(clarification?.questions).toHaveLength(3);
    expect(clarification?.questions.join(' ')).toContain('social media');
    expect(clarification?.questions.join(' ')).toContain('per domain');
    expect(clarification?.questions.join(' ')).toContain('do not perform redirects');
  });

  it('does not ask for clarification once the supported constraints are explicit', async () => {
    const { reviewPolicyRequest } = await import('../policy-generator');

    const clarification = reviewPolicyRequest(
      'Use the default set of social media domains. Apply the limit per domain, and make this a block only policy after 3 minutes.',
    );

    expect(clarification).toBeNull();
  });

  it('instantly generates credit card shield from natural language', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration("don't be able to see any credit card number");
    expect(result).not.toBeNull();
    expect(result!.rules).toHaveLength(1);
    expect(result!.rules[0].name).toBe('Credit Card Shield');
    expect(result!.rules[0].action).toBe('block');
    expect(result!.rules[0].severity).toBe('critical');
    expect(result!.rules[0].conditions![0].field).toBe('arguments.extracted_entities.has_credit_cards');
  });

  it('instantly generates PII shield', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('block actions when sensitive data is visible');
    expect(result).not.toBeNull();
    expect(result!.rules[0].name).toBe('PII Shield');
    expect(result!.rules[0].action).toBe('block');
  });

  it('instantly generates price limit with require_approval for approval language', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('ask me before any purchase over $200');
    expect(result).not.toBeNull();
    expect(result!.rules[0].name).toContain('$200');
    expect(result!.rules[0].action).toBe('require_approval');
    expect(result!.rules[0].conditions![0].value).toBe(200);
  });

  it('instantly generates price limit with block for prohibitive language', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration("don't spend more than $500 on any purchase");
    expect(result).not.toBeNull();
    expect(result!.rules[0].action).toBe('block');
    expect(result!.rules[0].conditions![0].value).toBe(500);
  });

  it('infers require_approval action from approval keywords', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('require approval before accessing credit card info');
    expect(result).not.toBeNull();
    expect(result!.rules[0].action).toBe('require_approval');
  });

  it('returns null for complex policies that need LLM', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('only allow navigation to .gov domains between 9am and 5pm');
    expect(result).toBeNull();
  });

  it('instantly generates government ID shield', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('block when SSN or social security numbers are on the page');
    expect(result).not.toBeNull();
    expect(result!.rules[0].name).toBe('Government ID Shield');
    expect(result!.rules[0].conditions![0].field).toBe('arguments.extracted_entities.has_gov_ids');
  });

  it('instantly generates salary shield', async () => {
    const { tryInstantGeneration } = await import('../policy-generator');

    const result = tryInstantGeneration('warn me when salary information is visible');
    expect(result).not.toBeNull();
    expect(result!.rules[0].name).toBe('Salary Info Shield');
    expect(result!.rules[0].action).toBe('warn');
  });

  it('rejects explicit allow actions from preset activation input', async () => {
    const { validateRuntimeRules } = await import('../policy-generator');

    expect(() =>
      validateRuntimeRules([
        {
          id: 'allow-everything',
          name: 'Allow everything',
          severity: 'low',
          action: 'allow',
          enabled: true,
        },
      ]),
    ).toThrowError('Allow rules are not accepted from side-panel presets.');
  });
});

describe('looksLikePolicyDeclaration', () => {
  let looksLikePolicyDeclaration: (task: string) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    const { chrome } = createChromeStub();
    vi.stubGlobal('chrome', chrome);
    ({ looksLikePolicyDeclaration } = await import('../policy-generator'));
  });

  // --- Should match: standing policy rules ---

  it('matches prohibition + conditional clause', () => {
    expect(
      looksLikePolicyDeclaration("Don't open any file from Acme Inc. unless Jared has forwarded me a signed NDA."),
    ).toBe(true);
  });

  it('matches "never ... until"', () => {
    expect(looksLikePolicyDeclaration('Never share my credentials until I explicitly approve')).toBe(true);
  });

  it('matches "do not ... except when"', () => {
    expect(looksLikePolicyDeclaration('Do not submit any form except when I am on my company domain')).toBe(true);
  });

  it('matches prohibition + broad scope (any/all/every)', () => {
    expect(looksLikePolicyDeclaration("Don't click on any ad or sponsored link")).toBe(true);
  });

  it('matches "never" + "all"', () => {
    expect(looksLikePolicyDeclaration('Never enter my password on all third-party sites')).toBe(true);
  });

  it('matches "block ... from"', () => {
    expect(looksLikePolicyDeclaration('Block any request from unknown domains')).toBe(true);
  });

  it('matches "deny all"', () => {
    expect(looksLikePolicyDeclaration('Deny all downloads from untrusted sources')).toBe(true);
  });

  it('matches "require approval"', () => {
    expect(looksLikePolicyDeclaration('Require my approval before making any purchase')).toBe(true);
  });

  it('matches "require permission"', () => {
    expect(looksLikePolicyDeclaration('Require permission to access sensitive data')).toBe(true);
  });

  it('matches "warn me when"', () => {
    expect(looksLikePolicyDeclaration('Warn me when the page contains credit card fields')).toBe(true);
  });

  it('matches "alert me if"', () => {
    expect(looksLikePolicyDeclaration('Alert me if a page tries to access my location')).toBe(true);
  });

  it('matches "only if" conditional', () => {
    expect(looksLikePolicyDeclaration("Don't proceed with checkout only if the total is under $50")).toBe(true);
  });

  // --- Should NOT match: immediate browsing instructions ---

  it('rejects simple browsing task', () => {
    expect(looksLikePolicyDeclaration('Go to amazon.com and find the cheapest laptop')).toBe(false);
  });

  it('rejects specific page instruction', () => {
    expect(looksLikePolicyDeclaration('Click the submit button on the form')).toBe(false);
  });

  it('rejects search task', () => {
    expect(looksLikePolicyDeclaration('Search for flights from NYC to London')).toBe(false);
  });

  it('rejects general question', () => {
    expect(looksLikePolicyDeclaration('What is the weather in San Francisco?')).toBe(false);
  });

  it('rejects simple negation without condition or scope', () => {
    expect(looksLikePolicyDeclaration("Don't click that button")).toBe(false);
  });

  it('rejects navigation instruction', () => {
    expect(looksLikePolicyDeclaration('Open my email and check for new messages')).toBe(false);
  });
});
