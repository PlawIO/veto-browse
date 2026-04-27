import { DEFAULT_VETO_SETTINGS, vetoStore } from './veto';

export interface VetoPolicy {
  id: string;
  toolName: string;
  mode: 'deterministic' | 'llm';
  version: number;
  isActive: boolean;
  projectId?: string;
  constraints: VetoConstraint[];
  sessionConstraints?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VetoConstraint {
  argumentName: string;
  enabled: boolean;
  action?: 'deny' | 'require_approval';
  regex?: string;
  notRegex?: string;
  enum?: string[];
  notEnum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  [key: string]: unknown;
}

type ApiErrorBody = {
  error?: { message?: string };
  message?: string;
};

type PolicyResponse = VetoPolicy | { data?: VetoPolicy };

type PolicyListResponse = VetoPolicy[] | { data?: VetoPolicy[] };

type PolicyCreate = {
  toolName: string;
  mode: string;
  constraints: VetoConstraint[];
  sessionConstraints?: Record<string, unknown>;
};

type PolicyUpdate = {
  mode?: string;
  constraints?: VetoConstraint[];
  sessionConstraints?: Record<string, unknown>;
};

async function getHeaders(): Promise<Record<string, string>> {
  const config = await vetoStore.getVeto();
  if (!config.enabled || !config.apiKey) throw new Error('Enable Veto Guard and add an API key first');
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function getBaseUrl(): Promise<string> {
  const config = await vetoStore.getVeto();
  return (config.endpoint || DEFAULT_VETO_SETTINGS.endpoint).replace(/\/$/, '') + '/v1';
}

async function getError(resp: Response, fallback: string): Promise<Error> {
  const body = (await resp.json().catch(() => null)) as ApiErrorBody | null;
  return new Error(body?.error?.message || body?.message || fallback);
}

async function readPolicy(resp: Response): Promise<VetoPolicy> {
  const body = (await resp.json()) as PolicyResponse;
  return 'data' in body && body.data ? body.data : (body as VetoPolicy);
}

export const vetoApi = {
  async listPolicies(): Promise<VetoPolicy[]> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies`, { headers });
    if (!resp.ok) throw await getError(resp, `Failed to list policies: ${resp.status}`);
    const data = (await resp.json()) as PolicyListResponse;
    return Array.isArray(data) ? data : data.data || [];
  },

  async getPolicy(toolName: string): Promise<VetoPolicy | null> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies/${encodeURIComponent(toolName)}`, { headers });
    if (resp.status === 404) return null;
    if (!resp.ok) throw await getError(resp, `Failed to get policy: ${resp.status}`);
    return readPolicy(resp);
  },

  async createPolicy(policy: PolicyCreate): Promise<VetoPolicy> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies`, {
      method: 'POST',
      headers,
      body: JSON.stringify(policy),
    });
    if (!resp.ok) throw await getError(resp, `Failed to create policy: ${resp.status}`);
    return readPolicy(resp);
  },

  async updatePolicy(toolName: string, update: PolicyUpdate): Promise<VetoPolicy> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies/${encodeURIComponent(toolName)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(update),
    });
    if (!resp.ok) throw await getError(resp, `Failed to update policy: ${resp.status}`);
    return readPolicy(resp);
  },

  async activatePolicy(toolName: string): Promise<void> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies/${encodeURIComponent(toolName)}/activate`, {
      method: 'POST',
      headers,
    });
    if (!resp.ok) throw await getError(resp, `Failed to activate: ${resp.status}`);
  },

  async deactivatePolicy(toolName: string): Promise<void> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies/${encodeURIComponent(toolName)}/deactivate`, {
      method: 'POST',
      headers,
    });
    if (!resp.ok) throw await getError(resp, `Failed to deactivate: ${resp.status}`);
  },

  async deletePolicy(toolName: string): Promise<void> {
    const base = await getBaseUrl();
    const headers = await getHeaders();
    const resp = await fetch(`${base}/policies/${encodeURIComponent(toolName)}`, {
      method: 'DELETE',
      headers,
    });
    if (!resp.ok) throw await getError(resp, `Failed to delete: ${resp.status}`);
  },
};
