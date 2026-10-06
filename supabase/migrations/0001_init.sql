-- SheSpeaks schema (Postgres / Supabase). Timestamps are UTC `timestamp` columns.
-- The app connects with the database role (bypasses RLS); RLS is enabled with NO policies so the
-- public Supabase REST/anon API cannot read any of this personal data.

create table if not exists coaches (
  id integer generated always as identity primary key,
  name text not null,
  whatsapp text,
  email text not null unique,
  active integer not null default 1,
  created_at timestamp not null default (now() at time zone 'utc')
);

create table if not exists candidates (
  id integer generated always as identity primary key,
  token text not null unique,
  name text, city text, city_other text, whatsapp text, email text,
  locale text not null default 'fr',
  talk_language text, role text, seniority text,
  branch text,
  status text not null default 'en_cours',
  coach_id integer references coaches(id),
  current_screen text not null default 'profile',
  consent_photo integer not null default 0,
  selected_photo_id integer,
  next_point_date text,
  completed_at timestamp,
  reminders_sent integer not null default 0,
  last_reminder_at timestamp,
  last_activity_at timestamp not null default (now() at time zone 'utc'),
  created_at timestamp not null default (now() at time zone 'utc'),
  updated_at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_cand_status on candidates(status);
create index if not exists idx_cand_coach on candidates(coach_id);

create table if not exists answers (
  candidate_id integer not null references candidates(id) on delete cascade,
  code text not null,
  value text not null, -- JSON
  primary key (candidate_id, code)
);

create table if not exists tracks (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  title text not null, angle text, format text, domain text, hook text,
  origin text not null default 'croisement',  -- personnelle | croisement | coach
  state text not null default 'generee',      -- generee | retenue_coach | ecartee | choisie
  position integer not null default 0
);
create index if not exists idx_tracks_cand on tracks(candidate_id);

create table if not exists subjects (
  candidate_id integer primary key references candidates(id) on delete cascade,
  title text, abstract text, audience text, format text,
  application_state text not null default 'a_soumettre',
  abstract_edited integer not null default 0
);

create table if not exists review_items (
  candidate_id integer not null references candidates(id) on delete cascade,
  criterion text not null,
  result text not null,
  value text,
  primary key (candidate_id, criterion)
);

create table if not exists status_history (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  old_status text, new_status text not null, author text not null,
  at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_hist_cand on status_history(candidate_id);

create table if not exists notes (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  coach_id integer references coaches(id),
  text text not null, next_point_date text,
  at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_notes_cand on notes(candidate_id);

create table if not exists photos (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  filename text not null,           -- object path in the private Storage bucket
  mime text not null, size integer not null,
  width integer, height integer,
  created_at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_photos_cand on photos(candidate_id);

create table if not exists devfest_events (
  id integer generated always as identity primary key,
  city text not null unique,
  name text not null,
  cfp_close_date text, cfp_close_note text,
  event_date text, venue text,
  submission_url text, submission_label text
);

create table if not exists settings (key text primary key, value text not null);

create table if not exists login_tokens (
  token_hash text primary key,
  coach_id integer not null references coaches(id) on delete cascade,
  expires_at timestamp not null,
  used integer not null default 0
);

create table if not exists email_log (
  id integer generated always as identity primary key,
  kind text not null, to_addr text not null, subject text not null, body_text text not null,
  status text not null,             -- sent | logged | failed
  error text, candidate_id integer,
  at timestamp not null default (now() at time zone 'utc')
);
create index if not exists idx_email_at on email_log(at desc);

-- Seed: DevFest calendar (Bamenda dates still to confirm)
insert into devfest_events (city,name,cfp_close_date,cfp_close_note,event_date,venue,submission_url,submission_label) values
 ('yaounde','Yaoundé','2026-10-31','à 23 h 59 (heure de Yaoundé)','2026-11-21',null,'https://devfest.gdgyaounde.com/speakers','Sessionize, via devfest.gdgyaounde.com/speakers'),
 ('douala','Douala','2026-11-01','heure non précisée','2026-11-28','Majestic Cinéma','https://devfest.gdgdouala.org/cfp','devfest.gdgdouala.org/cfp (affiche : bit.ly/speakersdevfest26)'),
 ('bamenda','Bamenda',null,null,null,null,null,null)
on conflict (city) do nothing;

-- Lock the tables away from the public Supabase API
alter table coaches enable row level security;
alter table candidates enable row level security;
alter table answers enable row level security;
alter table tracks enable row level security;
alter table subjects enable row level security;
alter table review_items enable row level security;
alter table status_history enable row level security;
alter table notes enable row level security;
alter table photos enable row level security;
alter table devfest_events enable row level security;
alter table settings enable row level security;
alter table login_tokens enable row level security;
alter table email_log enable row level security;
