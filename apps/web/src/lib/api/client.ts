const BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? res.statusText), {
      status: res.status,
      body: err,
    });
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string, org_id?: string) =>
    request<{ success: true; data: { user: import('@crm/types').SessionUser } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, org_id }),
    }),

  logout: () => request<{ success: true; data: null }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ success: true; data: { user: import('@crm/types').SessionUser } }>('/auth/me'),

  changePassword: (current_password: string, new_password: string) =>
    request<{ success: true; data: null }>('/auth/change-password', {
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
      success: true;
      data: import('@crm/types').LeadView[];
      total: number;
      page: number;
      page_size: number;
      stage_options: unknown[];
      stage_outcomes: unknown[];
    }>(`/leads${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    request<{ success: true; data: import('@crm/types').LeadView }>(`/leads/${id}`),

  create: (data: Record<string, unknown>) =>
    request<{ success: true; data: { id: string } }>('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<void>(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/leads/${id}`, { method: 'DELETE' }),

  getTimeline: (id: string) =>
    request<{ success: true; data: unknown[] }>(`/leads/${id}/timeline`),

  getInteractions: (id: string) =>
    request<{ success: true; data: unknown[] }>(`/leads/${id}/interactions`),

  addInteraction: (id: string, data: Record<string, unknown>) =>
    request<{ success: true; data: unknown }>(`/leads/${id}/interactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFollowUps: (id: string) =>
    request<{ success: true; data: unknown[] }>(`/leads/${id}/follow-ups`),

  addFollowUp: (id: string, data: Record<string, unknown>) =>
    request<{ success: true; data: unknown }>(`/leads/${id}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFollowUp: (lead_id: string, follow_up_id: string, data: Record<string, unknown>) =>
    request<void>(`/leads/${lead_id}/follow-ups/${follow_up_id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getAssignmentHistory: (id: string) =>
    request<{ success: true; data: unknown[] }>(`/leads/${id}/assignment-history`),

  transfer: (id: string, data: { target_org_id: string; notes?: string }) =>
    request<{ success: true; data: { sourceLeadId: string; newLeadId: string } }>(`/leads/${id}/transfer`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ── Users ────────────────────────────────────────────────────────────────────

export const users = {
  list: () => request<{ success: true; data: unknown[]; total: number; page: number; page_size: number }>('/users'),

  get: (id: string) => request<{ success: true; data: unknown }>(`/users/${id}`),

  create: (data: Record<string, unknown>) =>
    request<{ success: true; data: { id: string; email: string }; temporary_password: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<void>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),

  resetPassword: (id: string, new_password?: string) =>
    request<{ success: true; data: { temporary_password: string } }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    }),

  assignable: () => request<{ success: true; data: unknown[] }>('/users/assignable'),

  orgChart: () => request<{ success: true; data: unknown[] }>('/users/org-chart'),

  team: () => request<{ success: true; data: unknown[] }>('/users/team'),
};

// ── Assignments ───────────────────────────────────────────────────────────────

export const assignments = {
  list: () => request<{ success: true; data: unknown[]; total: number; page: number; page_size: number }>('/assignments'),

  get: (id: string) => request<{ success: true; data: unknown }>(`/assignments/${id}`),

  create: (data: { lead_id: string; assigned_to: string; branch?: string; notes?: string }) =>
    request<{ success: true; data: unknown }>('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { assigned_to: string; notes?: string }) =>
    request<void>(`/assignments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<void>(`/assignments/${id}`, { method: 'DELETE' }),

  leadsHistory: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{
      success: true;
      data: import('@crm/types').LeadView[];
      total: number;
      page: number;
      page_size: number;
      stage_options: unknown[];
      stage_outcomes: unknown[];
    }>(`/assignments/mine${qs ? `?${qs}` : ''}`);
  },
};

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const campaigns = {
  list: () => request<{ success: true; data: unknown[] }>('/campaigns'),

  get: (id: string) => request<{ success: true; data: unknown }>(`/campaigns/${id}`),

  create: (data: { name: string; platform_name: string; status_name?: string; budget?: number; started_at?: string; ended_at?: string }) =>
    request<{ success: true; data: { id: string } }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<void>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/campaigns/${id}`, { method: 'DELETE' }),
};

// ── Orgs ─────────────────────────────────────────────────────────────────────

export const orgs = {
  list: (params: { cityIds?: string; stateIds?: string; countryIds?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{ success: true; data: Array<{ id: string; name: string; org_id: string; org_name?: string; city_id?: number | null; state_id?: number | null; country_id?: number | null; cityId?: number | null; stateId?: number | null; countryId?: number | null }> }>(`/orgs${qs ? `?${qs}` : ''}`);
  },

  all: () => request<{ success: true; data: Array<{ id: string; name: string; org_id: string }> }>('/orgs/all'),
};

// ── Lead Sources ─────────────────────────────────────────────────────────────

export const lead_sources = {
  list: () => request<{ success: true; data: Array<{ id: string; name: string }> }>('/lead-sources'),
};

// ── Lookups ───────────────────────────────────────────────────────────────────

export const lookups = {
  leadStages: () => request<{ success: true; data: unknown[] }>('/lookups/lead-stages'),
  leadStageOutcomes: (stage_id?: string) =>
    request<{ success: true; data: unknown[] }>(`/lookups/lead-stage-outcomes${stage_id !== undefined ? `?stage_id=${stage_id}` : ''}`),
  all: () => request<{ success: true; data: { platforms: unknown[]; interaction_types: unknown[]; sources: unknown[]; stages: unknown[]; campaign_statuses: unknown[] } }>('/lookups'),
  cities: (state_id?: number) =>
    request<{ success: true; data: unknown[] }>(`/lookups/cities${state_id !== undefined ? `?state_id=${state_id}` : ''}`),
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
      success: true;
      data: {
        countries: unknown[];
        states: unknown[];
        cities: unknown[];
      };
    }>(`/locations${qs ? `?${qs}` : ''}`);
  },

  list: (params: { level?: string; countryIds?: string; stateIds?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{ success: true; data: unknown[] }>(`/locations${qs ? `?${qs}` : ''}`);
  },
};

// ── Analytics ─────────────────────────────────────────────────────────────────

export const analytics = {
  dashboard: () => request<{ success: true; data: unknown }>('/analytics/dashboard'),
  campaigns: () => request<{ success: true; data: unknown[] }>('/analytics/dashboard/campaigns'),
  performance: () => request<{ success: true; data: unknown }>('/analytics/performance'),
  pipeline: () => request<{ success: true; data: unknown[] }>('/analytics/pipeline'),
};

// ── Activities ────────────────────────────────────────────────────────────────

export const activities = {
  list: () => request<{ success: true; data: unknown[] }>('/activities'),
};

// ── Follow-Ups ───────────────────────────────────────────────────────────────

export const followUps = {
  list: (params: { assignedRepId?: string; overdueOnly?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<{ success: true; data: unknown[]; pipeline?: unknown[] }>(`/follow-ups${qs ? `?${qs}` : ''}`);
  },
};
