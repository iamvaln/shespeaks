-- The exchanges between the coach and the candidate (spec 2026-10-11 « parcours de propositions »): every proposal the coach sends
-- (choice of topics, adjusted subject, photo request) with a frozen copy of what was sent and the candidate's answer. Additive only.
create table if not exists proposals (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  kind text not null,                     -- choix | sujet | photo
  payload text not null,                  -- JSON, frozen copy of what was sent
  state text not null default 'envoyee',  -- envoyee | repondue | remplacee
  response text,                          -- choisie | aucune | approuvee | changements | photo_deposee
  response_choice integer,                -- index of the chosen topic (choix)
  candidate_comment text,
  coach_id integer references coaches(id) on delete set null,
  sent_at timestamp not null default (now() at time zone 'utc'),
  answered_at timestamp,
  handled_at timestamp,                   -- the coach dealt with the answer
  reminded_at timestamp                   -- the one reminder after 48 h
);
create index if not exists idx_proposals_cand on proposals(candidate_id, kind, id);
alter table proposals enable row level security;
alter table tracks add column if not exists pitch text;          -- « pourquoi ce sujet lui irait », for the candidate
alter table subjects add column if not exists why text;          -- « Pourquoi ces changements »
alter table subjects add column if not exists plan text;         -- « Comment t'y prendre », one step per line
alter table candidates add column if not exists photo_validated_at timestamp;
alter table candidates add column if not exists submitted_at timestamp;
