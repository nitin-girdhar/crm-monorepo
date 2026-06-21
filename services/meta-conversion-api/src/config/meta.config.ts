export const metaConfig = {
  graph_api: {
    base_url: 'https://graph.facebook.com',
    lead_fields: [
      'field_data', 'ad_id', 'adset_id', 'campaign_id', 'form_id', 'id', 'created_time',
    ],
  },

  capi: {
    endpoint_template: 'https://graph.facebook.com/{api_version}/{pixel_id}/events',
    default_event_name: 'Lead',
    supported_action_sources: [
      'website', 'app', 'phone_call', 'chat', 'email', 'other', 'system_generated',
    ],
  },

  field_mappings: [
    { meta_key: 'email',      db_column: 'email',     required: false, pii: true },
    { meta_key: 'phone',      db_column: 'phone',     required: true,  pii: true },
    { meta_key: 'first_name', db_column: 'firstName', required: false, pii: false },
    { meta_key: 'last_name',  db_column: 'lastName',  required: false, pii: false },
    { meta_key: 'full_name',  db_column: null,         required: false, pii: false, split_into: ['firstName', 'lastName'] },
  ],

  dedup_window_seconds: 3600,
} as const;
