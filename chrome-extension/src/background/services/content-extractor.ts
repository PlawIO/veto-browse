/**
 * ContentExtractor — deterministic regex-based entity extraction from page text.
 *
 * Extracts prices, emails, and phone numbers from visible page content.
 * Results are cached per URL to avoid re-extraction on the same page.
 * Injected into Veto guard context as `extracted_entities` so rules can
 * condition on values like `arguments.extracted_entities.max_price > 150`.
 */

import { createLogger } from '@src/background/log';
import type { DOMBaseNode, DOMElementNode, DOMTextNode } from '@src/background/browser/dom/views';

const logger = createLogger('ContentExtractor');

export interface ExtractedEntities {
  prices: number[];
  max_price: number;
  min_price: number;
  emails: string[];
  phone_numbers: string[];
  salary_figures: number[];
  has_salary_figures: boolean;
  equity_percentages: number[];
  has_equity_info: boolean;
  sensitive_terms: string[];
  has_sensitive_pii: boolean;
  has_credit_cards: boolean;
  has_gov_ids: boolean;
  has_api_keys: boolean;
}

const EMPTY_ENTITIES: ExtractedEntities = {
  prices: [],
  max_price: 0,
  min_price: 0,
  emails: [],
  phone_numbers: [],
  salary_figures: [],
  has_salary_figures: false,
  equity_percentages: [],
  has_equity_info: false,
  sensitive_terms: [],
  has_sensitive_pii: false,
  has_credit_cards: false,
  has_gov_ids: false,
  has_api_keys: false,
};

// Multi-currency prices: $, €, £, ¥, ₹, CHF, etc.
const PRICE_REGEX = /(?:[$€£¥₹₩]|(?:USD|EUR|GBP|JPY|INR|CHF|AUD|CAD|CNY)\s?)\s?([\d,]+(?:\.\d{1,2})?)/gi;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// International phone numbers: +CC followed by digits, or common US/UK/EU formats
const PHONE_REGEX = /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

function isLikelyPhoneNumber(value: string): boolean {
  const normalized = value.trim();
  const digits = normalized.replace(/\D/g, '');

  if (normalized.startsWith('+')) {
    return digits.length >= 8;
  }

  return digits.length >= 10;
}

// Salary/compensation: keywords near amounts, multi-currency
const SALARY_REGEX =
  /(?:salary|compensation|pay|income|earning|comp|base|total\s*comp|ote|ctc)[:\s]*(?:[$€£¥₹]|(?:USD|EUR|GBP)\s?)?\s?([\d,]+(?:\.\d{1,2})?)\s*(?:k|K|pa|p\.a\.)?/gi;
const SALARY_AMOUNT_REGEX =
  /(?:[$€£¥₹])\s?([\d,]+(?:\.\d{1,2})?)\s*(?:k|K)\s*(?:\/yr|\/year|per\s*(?:year|annum)|salary|comp|annual|base)/gi;

const EQUITY_REGEX = /([\d.]+)\s*%\s*(?:equity|vesting|options|ownership|stake|shares|stock|rsus?|esop)/gi;

// Government ID patterns: US SSN, UK NI, generic tax IDs
const GOV_ID_REGEX = /\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b|\b\d{2}-\d{7}\b/g;

// Credit card patterns: 4 groups of 4 digits, common card formats
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

// API keys / secrets: long alphanumeric strings with common prefixes
const API_KEY_REGEX = /\b(?:sk|pk|api|key|token|secret|bearer)[-_]?[a-zA-Z0-9_-]{20,}\b/gi;

function parsePrice(match: string): number {
  return Number.parseFloat(match.replace(/,/g, ''));
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}

class ContentExtractorService {
  private _cache = new Map<string, ExtractedEntities>();
  private _maxCacheSize = 20;

  /**
   * Extract entities from the given text. Results are cached by URL.
   * Pass `null` for url to skip caching.
   */
  extract(pageText: string, url?: string): ExtractedEntities {
    if (url) {
      const cached = this._cache.get(url);
      if (cached) return cached;
    }

    if (!pageText || pageText.length < 3) return EMPTY_ENTITIES;

    // Cap input text to prevent CPU spikes on malicious pages
    const text = pageText.length > 200_000 ? pageText.slice(0, 200_000) : pageText;

    const prices: number[] = [];
    for (const match of text.matchAll(PRICE_REGEX)) {
      const price = parsePrice(match[1]);
      if (price > 0 && price < 1_000_000) {
        prices.push(price);
      }
      if (prices.length >= 100) break;
    }

    const emails = dedup([...text.matchAll(EMAIL_REGEX)].map(m => m[0].toLowerCase()).slice(0, 50));

    const phoneNumbers = dedup(
      [...text.matchAll(PHONE_REGEX)]
        .map(m => m[0].trim())
        .filter(isLikelyPhoneNumber)
        .slice(0, 50),
    );

    const salaryFigures: number[] = [];
    for (const regex of [SALARY_REGEX, SALARY_AMOUNT_REGEX]) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        const raw = match[1].replace(/,/g, '');
        let amount = Number.parseFloat(raw);
        if (match[0].toLowerCase().includes('k')) amount *= 1000;
        if (amount > 1000 && amount < 10_000_000) {
          salaryFigures.push(amount);
        }
        if (salaryFigures.length >= 50) break;
      }
    }

    const equityPercentages: number[] = [];
    for (const match of text.matchAll(EQUITY_REGEX)) {
      const pct = Number.parseFloat(match[1]);
      if (pct > 0 && pct <= 100) equityPercentages.push(pct);
      if (equityPercentages.length >= 50) break;
    }

    const govIdCount = [...text.matchAll(GOV_ID_REGEX)].length;
    const creditCardCount = [...text.matchAll(CREDIT_CARD_REGEX)].length;
    const apiKeyCount = [...text.matchAll(API_KEY_REGEX)].length;

    const sensitiveTerms: string[] = [];
    if (salaryFigures.length > 0) sensitiveTerms.push('salary');
    if (equityPercentages.length > 0) sensitiveTerms.push('equity');
    if (govIdCount > 0) sensitiveTerms.push('gov_id');
    if (creditCardCount > 0) sensitiveTerms.push('credit_card');
    if (apiKeyCount > 0) sensitiveTerms.push('api_key');
    if (emails.length > 0) sensitiveTerms.push('email');
    if (phoneNumbers.length > 0) sensitiveTerms.push('phone');

    const result: ExtractedEntities = {
      prices,
      max_price: prices.length > 0 ? Math.max(...prices) : 0,
      min_price: prices.length > 0 ? Math.min(...prices) : 0,
      emails,
      phone_numbers: phoneNumbers,
      salary_figures: salaryFigures,
      has_salary_figures: salaryFigures.length > 0,
      equity_percentages: equityPercentages,
      has_equity_info: equityPercentages.length > 0,
      sensitive_terms: sensitiveTerms,
      has_sensitive_pii: sensitiveTerms.length > 0,
      has_credit_cards: creditCardCount > 0,
      has_gov_ids: govIdCount > 0,
      has_api_keys: apiKeyCount > 0,
    };

    if (url) {
      if (this._cache.size >= this._maxCacheSize) {
        const oldest = this._cache.keys().next().value;
        if (oldest !== undefined) this._cache.delete(oldest);
      }
      this._cache.set(url, result);
    }

    logger.info(
      `Extracted: ${prices.length} prices (max: $${result.max_price}), ` +
        `${emails.length} emails, ${phoneNumbers.length} phones` +
        (salaryFigures.length > 0 ? `, ${salaryFigures.length} salary figures` : '') +
        (equityPercentages.length > 0 ? `, ${equityPercentages.length} equity refs` : '') +
        (govIdCount > 0 ? `, ${govIdCount} gov ID patterns` : ''),
    );

    return result;
  }

  getCached(url?: string): ExtractedEntities | null {
    if (!url) {
      return null;
    }

    return this._cache.get(url) ?? null;
  }

  extractVisibleEntities(root: DOMElementNode, url?: string): ExtractedEntities {
    const cached = this.getCached(url);
    if (cached) {
      return cached;
    }

    return this.extract(this.collectVisibleText(root), url);
  }

  reset(): void {
    this._cache.clear();
  }

  /**
   * Collect all visible text from a DOM element tree.
   * Traverses iteratively to avoid stack overflow on deep trees.
   */
  collectVisibleText(root: DOMElementNode): string {
    const parts: string[] = [];
    const stack: DOMBaseNode[] = [root];

    while (stack.length > 0) {
      const node = stack.pop()!;

      if (!node.isVisible) continue;

      if ('text' in node && typeof (node as DOMTextNode).text === 'string') {
        const text = (node as DOMTextNode).text.trim();
        if (text) parts.push(text);
      } else if ('children' in node) {
        const children = (node as DOMElementNode).children;
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
      }
    }

    return parts.join(' ');
  }
}

export const contentExtractor = new ContentExtractorService();
