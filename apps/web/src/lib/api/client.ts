const BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? res.statusText), {
      status: res.status,
      body: err,
    });
  }

  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string, org_id?: string) =>
    request<{ user: import('@crm/types').SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, org_id }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: import('@crm/types').SessionUser }>('/auth/me'),

  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// ── Leads ────────────────────────────────────────────────────────────────────

export interface LeadsListParams {
  status?: string;
  assigned_to?: string;
  assigned_user_id?: string;
  campaign_id?: string;
  search?: string;
  platforms?: string;
  org_ids?: string;
  page?: number;
  page_size?: number;
}

export const leads = {
  list: (params: LeadsListParams = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{
      leads: import('@crm/types').LeadView[];
      total: number;
      page: number;
      page_size: number;
      stage_options: unknown[];
      stage_outcomes: unknown[];
    }>(`/leads${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    request<{ lead: import('@crm/types').LeadView }>(`/leads/${id}`),

  create: (data: Record<string, unknown>) =>
    request<{ lead: { id: string } }>('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/leads/${id}`, { method: 'DELETE' }),

  getTimeline: (id: string) =>
    request<{ events: unknown[] }>(`/leads/${id}/timeline`),

  getInteractions: (id: string) =>
    request<{ interactions: unknown[] }>(`/leads/${id}/interactions`),

  addInteraction: (id: string, data: Record<string, unknown>) =>
    request<{ interaction: unknown }>(`/leads/${id}/interactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFollowUps: (id: string) =>
    request<{ follow_ups: unknown[] }>(`/leads/${id}/follow-ups`),

  addFollowUp: (id: string, data: Record<string, unknown>) =>
    request<{ follow_up: unknown }>(`/leads/${id}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFollowUp: (lead_id: string, follow_up_id: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/leads/${lead_id}/follow-ups/${follow_up_id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getAssignmentHistory: (id: string) =>
    request<{ history: unknown[] }>(`/leads/${id}/assignment-history`),
};

// ── Users ────────────────────────────────────────────────────────────────────

export const users = {
  list: () => request<{ users: unknown[] }>('/users'),

  get: (id: string) => request<{ user: unknown }>(`/users/${id}`),

  create: (data: Record<string, unknown>) =>
    request<{ user: { email: string; id: string }; temporary_password: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  resetPassword: (id: string, new_password?: string) =>
    request<{ temporary_password: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    }),

  assignable: () => request<{ users: unknown[] }>('/users/assignable'),

  orgChart: () => request<{ chart: unknown[] }>('/users/org-chart'),

  team: () => request<{ members: unknown[] }>('/users/team'),
};

// ── Assignments ───────────────────────────────────────────────────────────────

export const assignments = {
  list: () => request<{ assignments: unknown[] }>('/assignments'),

  get: (id: string) => request<{ assignment: unknown }>(`/assignments/${id}`),

  create: (data: { lead_id: string; assigned_to: string; branch?: string; notes?: string }) =>
    request<{ assignment: unknown }>('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { assigned_to: string; notes?: string }) =>
    request<{ ok: boolean }>(`/assignments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<{ ok: boolean }>(`/assignments/${id}`, { method: 'DELETE' }),
};

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const campaigns = {
  list: () => request<{ campaigns: unknown[] }>('/campaigns'),

  get: (id: string) => request<{ campaign: unknown }>(`/campaigns/${id}`),

  create: (data: { name: string; platform_name: string; status_name?: string; budget?: number; started_at?: string; ended_at?: string }) =>
    request<{ campaign: { id: string } }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/campaigns/${id}`, { method: 'DELETE' }),
};

// ── Branches ─────────────────────────────────────────────────────────────────

export const branches = {
  list: () => request<Array<{ id: string; name: string; org_id: string; org_name?: string }>>('/branches'),

  all: () => request<Array<{ id: string; name: string; org_id: string }>>('/branches/all'),
};

// ── Lead Sources ─────────────────────────────────────────────────────────────

export const lead_sources = {
  list: () => request<Array<{ id: string; name: string }>>('/lead-sources'),
};

// ── Lookups ───────────────────────────────────────────────────────────────────

export const lookups = {
  leadStages: () => request<unknown[]>('/lookups/lead-stages'),
  leadStageOutcomes: (stage_id?: string) =>
    request<unknown[]>(`/lookups/lead-stage-outcomes${stage_id !== undefined ? `?stage_id=${stage_id}` : ''}`),
  all: () => request<{ platforms: unknown[]; interaction_types: unknown[]; sources: unknown[]; stages: unknown[]; campaign_statuses: unknown[] }>('/lookups'),
  cities: (state_id?: number) =>
    request<unknown[]>(`/lookups/cities${state_id !== undefined ? `?state_id=${state_id}` : ''}`),
};

// ── Locations ─────────────────────────────────────────────────────────────────

export const locations = {
  get: (params: { country_id?: number; state_id?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{
      countries: unknown[];
      states: unknown[];
      cities: unknown[];
    }>(`/locations${qs ? `?${qs}` : ''}`);
  },
};

// ── Analytics ─────────────────────────────────────────────────────────────────

export const analytics = {
  dashboard: () => request<unknown>('/analytics/dashboard'),
  campaigns: () => request<unknown[]>('/analytics/dashboard/campaigns'),
  performance: () => request<unknown>('/analytics/performance'),
  pipeline: () => request<unknown[]>('/analytics/pipeline'),
};

// ── Activities ────────────────────────────────────────────────────────────────

export const activities = {
  list: () => request<{ activities: unknown[] }>('/activities'),
};
