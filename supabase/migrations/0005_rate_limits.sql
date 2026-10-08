-- Hits counted by the rate limiter (coach login, verification of login links).
-- Additive only (safe while previews and production share one database). Keys are HMAC digests, never raw IPs or emails.
create table if not exists rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_rate_limit_hits on rate_limit_hits (bucket, key, at);
alter table rate_limit_hits enable row level security; -- no policy: closed to the public Supabase API, the server connects as owner
