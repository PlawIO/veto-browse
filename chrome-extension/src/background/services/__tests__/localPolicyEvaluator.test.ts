import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the storage module before importing the evaluator
vi.mock('@extension/storage', () => ({
  localPoliciesStore: {
    get: vi.fn(),
  },
}));

import { localPolicyEvaluator } from '../localPolicyEvaluator';
import { localPoliciesStore } from '@extension/storage';
import type { LocalPoliciesConfig } from '@extension/storage';

const mockedGet = vi.mocked(localPoliciesStore.get);

const baseConfig: LocalPoliciesConfig = {
  enabled: true,
  blockedActions: [],
  allowedDomains: [],
  blockedDomains: [],
  maxActionsPerTask: 0,
  maxTabs: 0,
  contentFilters: [],
};

describe('LocalPolicyEvaluator', () => {
  beforeEach(() => {
    localPolicyEvaluator.resetSession();
    mockedGet.mockResolvedValue(baseConfig);
    // Force config refresh
    return localPolicyEvaluator.refreshConfig();
  });

  it('allows actions when disabled', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, enabled: false });
    await localPolicyEvaluator.refreshConfig();

    const result = await localPolicyEvaluator.evaluate('click_element', { index: 1 });
    expect(result.allowed).toBe(true);
  });

  it('blocks disabled actions', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, blockedActions: ['input_text'] });
    await localPolicyEvaluator.refreshConfig();

    const result = await localPolicyEvaluator.evaluate('input_text', { index: 1, text: 'hello' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('input_text');
    expect(result.reason).toContain('disabled');
  });

  it('allows non-blocked actions', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, blockedActions: ['input_text'] });
    await localPolicyEvaluator.refreshConfig();

    const result = await localPolicyEvaluator.evaluate('click_element', { index: 1 });
    expect(result.allowed).toBe(true);
  });

  it('enforces max actions per task', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, maxActionsPerTask: 2 });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('click_element', { index: 1 });
    expect(r1.allowed).toBe(true);

    const r2 = await localPolicyEvaluator.evaluate('click_element', { index: 2 });
    expect(r2.allowed).toBe(true);

    const r3 = await localPolicyEvaluator.evaluate('click_element', { index: 3 });
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('Task limit reached');
  });

  it('blocks navigation to blocked domains', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, blockedDomains: ['facebook.com', 'twitter.com'] });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://facebook.com/feed' });
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toContain('facebook.com');

    const r2 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://www.twitter.com/home' });
    expect(r2.allowed).toBe(false);

    const r3 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://youtube.com' });
    expect(r3.allowed).toBe(true);
  });

  it('enforces allowed domains whitelist', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, allowedDomains: ['example.com', 'docs.example.com'] });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://example.com/page' });
    expect(r1.allowed).toBe(true);

    const r2 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://docs.example.com/api' });
    expect(r2.allowed).toBe(true);

    const r3 = await localPolicyEvaluator.evaluate('go_to_url', { url: 'https://evil.com' });
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('not in the allowed list');
  });

  it('blocks content matching filters', async () => {
    mockedGet.mockResolvedValue({
      ...baseConfig,
      contentFilters: [
        {
          id: 'cc',
          label: 'Credit cards',
          pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
          enabled: true,
        },
        { id: 'disabled-one', label: 'Disabled', pattern: 'secret', enabled: false },
      ],
    });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('input_text', { index: 1, text: '4111 1111 1111 1111' });
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toContain('Credit cards');

    // Disabled filter should not block
    const r2 = await localPolicyEvaluator.evaluate('input_text', { index: 1, text: 'this is a secret' });
    expect(r2.allowed).toBe(true);

    // Normal text should pass
    const r3 = await localPolicyEvaluator.evaluate('input_text', { index: 1, text: 'Hello world' });
    expect(r3.allowed).toBe(true);
  });

  it('checks current URL domain for interaction actions', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, blockedDomains: ['banking.com'] });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('click_element', { index: 1 }, 'https://banking.com/transfer');
    expect(r1.allowed).toBe(false);

    const r2 = await localPolicyEvaluator.evaluate('click_element', { index: 1 }, 'https://safe-site.com');
    expect(r2.allowed).toBe(true);
  });

  it('resets action count on resetSession', async () => {
    mockedGet.mockResolvedValue({ ...baseConfig, maxActionsPerTask: 1 });
    await localPolicyEvaluator.refreshConfig();

    const r1 = await localPolicyEvaluator.evaluate('click_element', { index: 1 });
    expect(r1.allowed).toBe(true);

    const r2 = await localPolicyEvaluator.evaluate('click_element', { index: 2 });
    expect(r2.allowed).toBe(false);

    localPolicyEvaluator.resetSession();

    const r3 = await localPolicyEvaluator.evaluate('click_element', { index: 3 });
    expect(r3.allowed).toBe(true);
  });
});
