/**
 * PolicyGenerator — converts natural language to Veto rules via LLM.
 *
 * Uses the Planner model config (falls back to Navigator) to make a
 * single structured-output LLM call. The system prompt teaches the
 * LLM the full Rule schema, available context fields, operators, and
 * tool names so it can generate accurate, enforceable rules.
 */

import { z } from 'zod';
import {
  agentModelStore,
  AgentNameEnum,
  llmProviderStore,
  ProviderTypeEnum,
  type ModelConfig,
} from '@extension/storage';
import { createChatModel } from '@src/background/agent/helper';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Rule, RuleCondition } from 'veto-sdk/browser';
import { vetoStore } from '@extension/storage';
import { createLogger } from '@src/background/log';
import {
  extractJsonFromModelOutput,
  removeThinkTags,
  wrapUntrustedContent,
} from '@src/background/agent/messages/utils';

const logger = createLogger('PolicyGenerator');

const API_TIMEOUT_MS = 30_000;
const LOCAL_TIMEOUT_MS = 60_000;
const VETO_HOSTED_ENDPOINT = 'https://api.veto.so';

// --- Zod schema for LLM output ---

// OpenAI structured output requires .nullable() alongside .optional().
// Use .nullable().optional() on every non-required field so the schema
// works with OpenAI, Anthropic, Gemini, and manual JSON extraction alike.

const conditionValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]);

const ruleConditionSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: conditionValueSchema,
});

export const runtimeRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  action: z.enum(['block', 'warn', 'log', 'allow', 'require_approval']),
  tools: z.array(z.string()).nullable().optional(),
  conditions: z.array(ruleConditionSchema).nullable().optional(),
  condition_groups: z.array(z.array(ruleConditionSchema)).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

const generatedRuleSchema = runtimeRuleSchema.extend({
  enabled: z.literal(true).default(true),
});

const policyOutputSchema = z.object({
  rules: z.array(generatedRuleSchema).min(1),
  explanation: z.string(),
});

type PolicyOutput = z.infer<typeof policyOutputSchema>;

export interface PolicyClarificationRequest {
  explanation: string;
  questions: string[];
}

export interface PolicyGenerationSuccessResult {
  success: true;
  kind: 'preview';
  rules: Rule[];
  explanation: string;
}

export interface PolicyGenerationClarificationResult {
  success: true;
  kind: 'clarification';
  rules: [];
  explanation: string;
  clarification: PolicyClarificationRequest;
}

export interface PolicyGenerationFailureResult {
  success: false;
  kind: 'error';
  rules: [];
  explanation: string;
  error: string;
}

export type PolicyGenerationResult =
  | PolicyGenerationSuccessResult
  | PolicyGenerationClarificationResult
  | PolicyGenerationFailureResult;

/**
 * Detect natural-language policy declarations — standing rules with conditions
 * that should route to policy generation rather than the browser automation loop.
 *
 * Conservative: matches clear policy patterns to avoid false-routing
 * legitimate browsing instructions like "don't click that button".
 */
export function looksLikePolicyDeclaration(task: string): boolean {
  const t = task.toLowerCase().trim();

  // Reusable fragments
  const hasProhibition = /\b(?:don'?t|do\s*not|never)\b/.test(t);
  const hasCondition = /\b(?:unless|until|without|except\s+(?:if|when)|only\s+(?:if|when))\b/.test(t);
  const hasScope = /\b(?:any(?:thing|one|where)?|all|every(?:thing|one|where)?)\b/.test(t);

  // Standing prohibition + conditional clause = policy rule
  if (hasProhibition && hasCondition) return true;

  // Broad prohibition targeting a class of things (anything, anyone, all, every, etc.)
  if (hasProhibition && hasScope) return true;

  // Imperative "never" at the start is a standing rule, not a one-off instruction
  // ("Never visit X" vs "don't click that"). Excludes "never mind".
  if (/^(?:please\s+)?never\b/.test(t) && !/^(?:please\s+)?never\s*mind\b/.test(t)) return true;

  // Explicit blocking/restricting with scope
  if (/\b(?:block|deny|restrict|prevent)\b/.test(t) && (hasScope || /\bfrom\s+\w+/.test(t))) return true;

  // Approval or alert requirements
  if (/\brequire\s+(?:my\s+)?(?:approval|permission)\b/i.test(t)) return true;
  if (/\b(?:warn|alert)\s+me\b/i.test(t) && /\b(?:if|when|before|whenever)\b/i.test(t)) return true;

  return false;
}

// --- Operator whitelist for validation ---

const VALID_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'matches',
  'greater_than',
  'less_than',
  'percent_of',
  'length_greater_than',
  'in',
  'not_in',
  'outside_hours',
  'within_hours',
]);

// --- System prompt ---

const SYSTEM_PROMPT = `You are a security policy compiler for a browser automation agent.

Convert the user's natural-language policy into one or more Veto rules (JSON).

## Rule Schema

Each rule is a JSON object:
{
  "id": string,           // kebab-case unique ID (e.g., "block-expensive-purchases")
  "name": string,         // short human-readable name
  "description": string,  // 1-2 sentence description
  "enabled": true,
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "action": "block" | "warn" | "log" | "allow" | "require_approval",
  "tools": string[],      // which browser actions this applies to (omit for ALL)
  "conditions": [         // ALL must match (AND logic)
    { "field": string, "operator": string, "value": any }
  ],
  "condition_groups": [   // groups are OR'd; conditions within each group are AND'd
    [ { "field": ..., "operator": ..., "value": ... } ]
  ],
  "tags": string[]
}

## Available Tools (prefix: browser_)

browser_clickElement, browser_inputText, browser_goToUrl, browser_searchGoogle,
browser_scrollToPercent, browser_switchTab, browser_openTab, browser_closeTab,
browser_goBack, browser_sendKeys, browser_wait, browser_scrollToText,
browser_selectDropdownOption, browser_getDropdownOptions, browser_cacheContent,
browser_done, browser_scrollToTop, browser_scrollToBottom, browser_nextPage,
browser_previousPage

Omit "tools" to apply to ALL actions.

## Available Condition Fields

You can condition on ANY field using dot notation. Choose the RIGHT scope:

### Scope 1 — Element context (per-element enforcement)
Available for actions targeting a specific page element (click, input, scroll-to).
Use this when the policy applies to SPECIFIC ITEMS, not the whole page.

**Structured fields (most precise — use when table/grid detected):**
- arguments.element_context.row_fields.{ColumnName} (string) — value of a specific column in this row. Column names come from table headers. Example: arguments.element_context.row_fields.Location contains "NYC" matches only rows where the Location column contains "NYC".

**Text fields (always available):**
- arguments.element_context.element_text (string) — the target element's own text
- arguments.element_context.row_text (string) — ALL visible text in the element's row/container. In a spreadsheet row: "1 Antler US Fund $160 1/5/2026 NYC". Use "contains" for substring matching.

**Per-row entities (auto-extracted from row_text):**
- arguments.element_context.row_entities.prices (number[]) — prices in this row
- arguments.element_context.row_entities.max_price (number) — highest price in this row
- arguments.element_context.row_entities.emails (string[]) — emails in this row
- arguments.element_context.row_entities.has_sensitive_pii (boolean) — PII in this row
- arguments.element_context.row_entities.has_salary_figures (boolean) — salary data in this row
- arguments.element_context.row_entities.has_credit_cards (boolean) — credit cards in this row
- arguments.element_context.row_entities.has_gov_ids (boolean) — gov IDs in this row
(Same fields as extracted_entities below, but scoped to this row only.)

### Scope 2 — Page context (page-wide enforcement)
Use this when the policy applies to the ENTIRE PAGE, not specific items.

- arguments.current_url (string) — current page URL
- arguments.page_title (string) — current page title
- arguments.action_index (number) — action sequence number in this task
- arguments.domain_time_seconds (number) — cumulative seconds on this domain

**Page-wide extracted entities:**
- arguments.extracted_entities.max_price (number) — highest price on entire page
- arguments.extracted_entities.has_sensitive_pii (boolean) — any PII on page
- arguments.extracted_entities.has_credit_cards (boolean) — credit cards on page
- arguments.extracted_entities.has_salary_figures (boolean) — salary data on page
- arguments.extracted_entities.has_gov_ids (boolean) — gov IDs on page
- arguments.extracted_entities.has_api_keys (boolean) — API keys on page
- arguments.extracted_entities.has_equity_info (boolean) — equity data on page
- arguments.extracted_entities.prices (number[])
- arguments.extracted_entities.emails (string[])
- arguments.extracted_entities.phone_numbers (string[])
- arguments.extracted_entities.salary_figures (number[])
- arguments.extracted_entities.equity_percentages (number[])
- arguments.extracted_entities.sensitive_terms (string[]) — categories found

**Element styles:**
- arguments.computed_styles.* — CSS properties (backgroundColor, color, fontSize, etc.)

### Scope 3 — Action-specific arguments
- arguments.url — target URL for navigation
- arguments.text — text being typed
- arguments.query — search query
- arguments.index — target element index

You can also use any custom field path. Unknown fields resolve to undefined and conditions on them won't match.

### Which scope to use:
- "Block items in NYC" → element_context.row_fields.Location or element_context.row_text (per-item)
- "Block rows over $150" → element_context.row_entities.max_price (per-item)
- "Block when credit cards visible" → extracted_entities.has_credit_cards (page-wide)
- "Block after 20 min on social media" → domain_time_seconds (page-wide)
- "Block navigation to competitor.com" → current_url (page-wide)

## Operators

equals, not_equals, contains, not_contains, starts_with, ends_with, matches,
greater_than, less_than, in, not_in, length_greater_than, percent_of,
outside_hours, within_hours

For time-based: use "HH:MM-HH:MM" format (e.g., "09:00-17:00"). Handles overnight ranges.
You can use any operator the Veto SDK supports. Unknown operators are passed through to cloud evaluation.

## Action Types

- "block" — prevent the action (hard limit)
- "require_approval" — pause and ask the human to approve/deny
- "warn" — log warning but allow
- "log" — silently log
- "allow" — explicitly allow (for exceptions)

Use "block" for hard safety limits. Use "require_approval" when the user wants case-by-case review.

## Rules

1. Rules are evaluated per-action, not per-page
2. Use "conditions" for AND logic, "condition_groups" for OR logic
3. For URL matching, prefer "contains" or "matches" over "equals"
4. For page-wide price thresholds, use "arguments.extracted_entities.max_price" with "greater_than"
5. For per-row price thresholds, use "arguments.element_context.row_entities.max_price" with "greater_than"
6. Generate the minimum number of rules needed
7. PREFER element_context.row_fields.{Column} when the user references a specific column/field — this is the most precise
8. FALL BACK to element_context.row_text with "contains" when column names aren't clear
9. NEVER use extracted_entities for per-item policies — it covers the whole page, not individual rows

## Output Format

Return JSON with exactly two fields:
{
  "rules": [ ... ],
  "explanation": "1-3 sentence plain-English explanation"
}`;

// --- LLM helpers ---

function shouldUseStructuredOutput(modelConfig: ModelConfig): boolean {
  const name = modelConfig.modelName;
  if (name === 'deepseek-reasoner' || name === 'deepseek-r1') return false;
  if (modelConfig.provider === ProviderTypeEnum.Llama) return false;
  if (name.includes('Llama-4') || name.includes('Llama-3.3') || name.includes('llama-3.3')) return false;
  return true;
}

export function resolvePolicyGenerationEndpoint(endpoint: string, isAuthenticated: boolean): string {
  return isAuthenticated ? VETO_HOSTED_ENDPOINT : endpoint;
}

function normalizePolicyInput(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function hasExplicitDomainList(input: string): boolean {
  return /\b(x|twitter|reddit|instagram|facebook|tiktok|youtube|linkedin)\.com\b/i.test(input);
}

function hasSupportedRedirectFallback(input: string): boolean {
  return /\b(block only|just block|no redirect|don't redirect|do not redirect|skip redirect)\b/i.test(input);
}

export function reviewPolicyRequest(input: string): PolicyClarificationRequest | null {
  const normalizedInput = normalizePolicyInput(input);
  const lowerInput = normalizedInput.toLowerCase();
  const questions: string[] = [];

  const mentionsRedirect =
    /\bredirect\b|\broute me to\b|\bsend me to\b|\btake me to\b|\bopen my\b|\bopen the\b/.test(lowerInput) &&
    /(task list|todo|to-do|tasks|calendar|planner|inbox)/.test(lowerInput);

  const mentionsSocialCategory = /social media|social tabs|social sites|social apps/.test(lowerInput);
  const mentionsTimeThreshold =
    /\b\d+\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/.test(lowerInput) ||
    /\bmore than\b|\bover\b|\bafter\b/.test(lowerInput);
  const mentionsCrossSiteWindow = /\btoday\b|\bdaily\b|\bacross\b|\ball social\b/.test(lowerInput);
  const acceptsDefaultSocialDomains = /\bdefault\b|\bstandard set\b/.test(lowerInput);

  if (mentionsSocialCategory && !hasExplicitDomainList(normalizedInput) && !acceptsDefaultSocialDomains) {
    questions.push(
      'Which domains should count as social media for this rule? If you want, say “use the default set” and I’ll use x.com, twitter.com, reddit.com, instagram.com, facebook.com, tiktok.com, youtube.com, and linkedin.com.',
    );
  }

  if (mentionsSocialCategory && mentionsTimeThreshold && mentionsCrossSiteWindow) {
    questions.push(
      'Should that time limit apply per domain (for example 3 minutes on x.com) or across all social sites combined? The current policy engine enforces per-domain time reliably.',
    );
  }

  if (mentionsRedirect && !hasSupportedRedirectFallback(normalizedInput)) {
    questions.push(
      'Veto policies can block, require approval, warn, or log, but they do not perform redirects on their own. Do you want a block-only policy, or a separate follow-up automation? If you want the follow-up flow, what exact task-list URL should be used?',
    );
  }

  if (questions.length === 0) {
    return null;
  }

  return {
    explanation:
      'I need a couple of clarifications before I can create this policy without guessing or silently encoding the wrong behavior.',
    questions,
  };
}
async function createPolicyLLM(): Promise<{ llm: BaseChatModel; modelConfig: ModelConfig }> {
  const agentModels = await agentModelStore.getAllAgentModels();
  const providers = await llmProviderStore.getAllProviders();

  const modelConfig = agentModels[AgentNameEnum.Planner] ?? agentModels[AgentNameEnum.Navigator];
  if (!modelConfig) {
    throw new Error('No LLM model configured. Configure a Planner or Navigator model in settings.');
  }

  const providerConfig = providers[modelConfig.provider];
  if (!providerConfig) {
    throw new Error(`Provider "${modelConfig.provider}" not found. Check your settings.`);
  }

  return { llm: createChatModel(providerConfig, modelConfig), modelConfig };
}

// --- Post-processing ---
// Philosophy: pass through everything the LLM generates. Warn on unrecognized
// patterns but NEVER silently drop conditions, fields, or tools. The local
// evaluator and cloud SDK decide enforcement, not the generator.

const KNOWN_TOOLS = new Set([
  'browser_clickElement',
  'browser_inputText',
  'browser_goToUrl',
  'browser_searchGoogle',
  'browser_scrollToPercent',
  'browser_switchTab',
  'browser_openTab',
  'browser_closeTab',
  'browser_goBack',
  'browser_sendKeys',
  'browser_wait',
  'browser_scrollToText',
  'browser_selectDropdownOption',
  'browser_getDropdownOptions',
  'browser_cacheContent',
  'browser_done',
  'browser_scrollToTop',
  'browser_scrollToBottom',
  'browser_nextPage',
  'browser_previousPage',
]);

function sanitizeRules(parsed: { rules: Array<z.infer<typeof runtimeRuleSchema>> }): Rule[] {
  const seenIds = new Set<string>();

  return parsed.rules.map(r => {
    let id = `local-nl-${r.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
    while (seenIds.has(id)) {
      id = `${id}-${crypto.randomUUID().slice(0, 8)}`;
    }
    seenIds.add(id);

    // Warn on unknown tools but KEEP them — cloud SDK or future tools may recognize them
    if (r.tools) {
      for (const t of r.tools) {
        if (!KNOWN_TOOLS.has(t)) {
          logger.warning(`Unknown tool "${t}" in rule "${r.name}" — kept (may match future/cloud tools)`);
        }
      }
    }

    // Warn on unknown operators but KEEP them — cloud SDK may support more
    const toCondition = (c: { field: string; operator: string; value?: unknown }): RuleCondition => {
      if (!VALID_OPERATORS.has(c.operator)) {
        logger.warning(`Unrecognized operator "${c.operator}" in rule "${r.name}" — kept for cloud evaluation`);
      }
      return {
        field: c.field,
        operator: c.operator as RuleCondition['operator'],
        value: c.value,
      };
    };

    const rule: Rule = {
      id,
      name: r.name,
      description: r.description ?? undefined,
      enabled: true,
      severity: r.severity,
      action: r.action,
      tools: r.tools ?? undefined,
      conditions: r.conditions?.map(toCondition),
      condition_groups: r.condition_groups?.map(group => group.map(toCondition)),
      tags: r.tags ?? ['nl-generated'],
    };

    return rule;
  });
}

export function validateRuntimeRules(rules: unknown, options: { allowExplicitAllowAction?: boolean } = {}): Rule[] {
  const parsedRules = z.array(runtimeRuleSchema).min(1).parse(rules);

  if (!options.allowExplicitAllowAction) {
    const hasAllowRule = parsedRules.some(rule => rule.action === 'allow');
    if (hasAllowRule) {
      throw new Error('Allow rules are not accepted from side-panel presets.');
    }
  }

  return sanitizeRules({ rules: parsedRules });
}

// --- Veto-hosted policy generation (CWS mode) ---

async function generateViaVetoAPI(input: string, authToken: string, endpoint: string): Promise<PolicyOutput> {
  const response = await fetch(`${endpoint}/v1/policy/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ policy_description: input }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Veto API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return policyOutputSchema.parse(data);
}

// --- Instant generation for well-known patterns ---
// Zero-latency, deterministic rule generation for common intents.
// Falls through to LLM for anything it can't confidently match.

function inferActionFromIntent(input: string): 'block' | 'require_approval' | 'warn' | 'log' {
  const lower = input.toLowerCase();
  if (/\b(ask|approv|confirm|review|check with)/.test(lower)) return 'require_approval';
  if (/\b(warn|alert|flag)/.test(lower)) return 'warn';
  if (/\b(log|track|monitor|record)/.test(lower)) return 'log';
  return 'block';
}

function actionVerb(action: string): string {
  if (action === 'block') return 'Blocks';
  if (action === 'require_approval') return 'Requires approval for';
  if (action === 'warn') return 'Warns about';
  return 'Logs';
}

function extractPriceThreshold(input: string): number | null {
  const match = input.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  const wordMatch = input.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd)/i);
  if (wordMatch) return parseFloat(wordMatch[1]);
  return null;
}

type InstantAction = 'block' | 'require_approval' | 'warn' | 'log';

function instantRule(
  id: string,
  name: string,
  description: string,
  severity: 'critical' | 'high',
  action: InstantAction,
  conditions: Array<{ field: string; operator: string; value: string | number | boolean }>,
) {
  return { id, name, description, enabled: true as const, severity, action, conditions };
}

export function tryInstantGeneration(input: string): PolicyOutput | null {
  const lower = input.toLowerCase();
  const action = inferActionFromIntent(input);
  const verb = actionVerb(action);

  if (/credit\s*card|card\s*number|cc\s*num/i.test(lower)) {
    return {
      rules: [
        instantRule(
          'instant-credit-card-shield',
          'Credit Card Shield',
          'Prevents actions when credit card numbers are detected on the page',
          'critical',
          action,
          [{ field: 'arguments.extracted_entities.has_credit_cards', operator: 'equals', value: true }],
        ),
      ],
      explanation: `${verb} all browser actions when credit card numbers are detected on the page.`,
    };
  }

  if (/\b(pii|personal\s*(data|info(rmation)?)|sensitive\s*(data|info))\b/i.test(lower)) {
    return {
      rules: [
        instantRule(
          'instant-pii-shield',
          'PII Shield',
          'Prevents actions when sensitive personal information is detected',
          'critical',
          action,
          [{ field: 'arguments.extracted_entities.has_sensitive_pii', operator: 'equals', value: true }],
        ),
      ],
      explanation: `${verb} all browser actions when sensitive personal data is detected on the page.`,
    };
  }

  if (/\b(gov(ernment)?\s*id|ssn|social\s*security|passport|driver'?s?\s*licen[sc]e)\b/i.test(lower)) {
    return {
      rules: [
        instantRule(
          'instant-gov-id-shield',
          'Government ID Shield',
          'Prevents actions when government ID patterns are detected',
          'critical',
          action,
          [{ field: 'arguments.extracted_entities.has_gov_ids', operator: 'equals', value: true }],
        ),
      ],
      explanation: `${verb} all browser actions when government ID patterns (SSN, passport, license numbers) are detected.`,
    };
  }

  if (/\b(api\s*key|secret\s*key|access\s*token|credential)\b/i.test(lower)) {
    return {
      rules: [
        instantRule(
          'instant-api-key-shield',
          'API Key Shield',
          'Prevents actions when API keys or secrets are detected',
          'critical',
          action,
          [{ field: 'arguments.extracted_entities.has_api_keys', operator: 'equals', value: true }],
        ),
      ],
      explanation: `${verb} all browser actions when API keys or secrets are detected on the page.`,
    };
  }

  const price = extractPriceThreshold(input);
  if (price !== null && /price|cost|spend|purchas|buy|order|checkout|cart|limit/i.test(lower)) {
    const priceAction: InstantAction = /\b(block|stop|prevent|never|don'?t)\b/i.test(lower)
      ? 'block'
      : 'require_approval';
    return {
      rules: [
        instantRule(
          `instant-price-limit-${price}`,
          `Price Limit ($${price})`,
          `Controls actions when prices exceed $${price}`,
          'high',
          priceAction,
          [{ field: 'arguments.extracted_entities.max_price', operator: 'greater_than', value: price }],
        ),
      ],
      explanation: `${actionVerb(priceAction)} actions when the highest price on the page exceeds $${price}.`,
    };
  }

  if (/\b(salary|salaries|compensation|pay\s*(rate|scale|range)|wage)\b/i.test(lower)) {
    return {
      rules: [
        instantRule(
          'instant-salary-shield',
          'Salary Info Shield',
          'Prevents actions when salary or compensation data is detected',
          'high',
          action,
          [{ field: 'arguments.extracted_entities.has_salary_figures', operator: 'equals', value: true }],
        ),
      ],
      explanation: `${verb} all browser actions when salary or compensation figures are detected.`,
    };
  }

  return null;
}

// --- Main export ---

export async function generatePolicy(input: string): Promise<PolicyGenerationResult> {
  logger.info(`Generating policy from: "${input.slice(0, 100)}..."`);

  try {
    const clarification = reviewPolicyRequest(input);
    if (clarification) {
      logger.info(`Policy clarification required: ${clarification.questions.join(' | ')}`);
      return {
        success: true,
        kind: 'clarification',
        rules: [],
        explanation: clarification.explanation,
        clarification,
      };
    }

    // Instant generation for well-known patterns (zero latency)
    const instant = tryInstantGeneration(input);
    if (instant) {
      const rules = sanitizeRules(instant);
      logger.info(`Instant generation: ${rules.length} rule(s): ${rules.map(r => r.name).join(', ')}`);
      return { success: true, kind: 'preview', rules, explanation: instant.explanation };
    }

    // Try Veto-hosted mode first (user logged in via veto.so)
    const config = await vetoStore.getVeto();
    if (config.isAuthenticated && config.authToken) {
      logger.info('Using Veto-hosted policy generation');
      const parsed = await Promise.race([
        generateViaVetoAPI(
          input,
          config.authToken,
          resolvePolicyGenerationEndpoint(config.endpoint, config.isAuthenticated),
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Veto API timed out')), API_TIMEOUT_MS)),
      ]);
      const rules = sanitizeRules(parsed);
      logger.info(`Veto API generated ${rules.length} rule(s)`);
      return {
        success: true,
        kind: 'preview',
        rules,
        explanation: parsed.explanation,
      };
    }

    // Fall back to local LLM (BYOK mode)
    const { llm, modelConfig } = await createPolicyLLM();
    const useStructured = shouldUseStructuredOutput(modelConfig);

    const sanitizedInput = wrapUntrustedContent(input, true);
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`Convert this policy into Veto rules:\n\n${sanitizedInput}`),
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOCAL_TIMEOUT_MS);

    const llmCall = async (): Promise<PolicyOutput> => {
      try {
        if (useStructured) {
          const structuredLlm = llm.withStructuredOutput(policyOutputSchema, {
            includeRaw: true,
            name: 'policy_output',
          });

          const response = await structuredLlm.invoke(messages, { signal: controller.signal });
          if (response.parsed) return policyOutputSchema.parse(response.parsed);

          if (response.raw?.content && typeof response.raw.content === 'string') {
            const cleaned = removeThinkTags(response.raw.content);
            const extracted = extractJsonFromModelOutput(cleaned);
            return policyOutputSchema.parse(extracted as unknown);
          }

          throw new Error('Structured output returned no parsed result');
        }

        const response = await llm.invoke(messages, { signal: controller.signal });
        if (typeof response.content !== 'string') {
          throw new Error('LLM returned non-string content');
        }
        const cleaned = removeThinkTags(response.content);
        const extracted = extractJsonFromModelOutput(cleaned);
        return policyOutputSchema.parse(extracted as unknown);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const parsed = await llmCall();

    const rules = sanitizeRules(parsed);

    logger.info(`Generated ${rules.length} rule(s): ${rules.map(r => r.name).join(', ')}`);

    return {
      success: true,
      kind: 'preview',
      rules,
      explanation: parsed.explanation,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Policy generation failed: ${msg}`);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        kind: 'error',
        rules: [],
        explanation: '',
        error: `Invalid rule structure from LLM: ${error.issues.map(i => i.message).join(', ')}`,
      };
    }

    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    if (isAbort || msg.includes('timed out')) {
      return {
        success: false,
        kind: 'error',
        rules: [],
        explanation: '',
        error: 'Policy generation timed out. Try a simpler description or a faster model.',
      };
    }

    return {
      success: false,
      kind: 'error',
      rules: [],
      explanation: '',
      error: msg,
    };
  }
}
