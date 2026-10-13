-- « Reprendre avec un code »: a 6-digit code sent by email lets a candidate pick up her journey in any browser (an in-app browser that
-- keeps no cookie, another phone), so she never starts a second one. Only a keyed hash of the code is kept; it expires after 15 minutes
-- and five wrong tries void it. Additive only.
create table if not exists resume_codes (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  code_hash text not null,
  expires_at timestamp not null,
  attempts integer not null default 0,
  used_at timestamp,
  created_at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_resume_codes_candidate on resume_codes (candidate_id);
alter table resume_codes enable row level security;
