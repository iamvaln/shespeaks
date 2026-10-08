-- Keep the provider's message id (Resend) so a log row can be traced in the Resend dashboard.
alter table email_log add column if not exists provider_id text;
