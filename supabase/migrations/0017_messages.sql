-- Conversations between the coach and the candidate, outside the proposals' buttons: a reply under one exchange (her comment on a choice,
-- « aucune », a request for changes…) or a message on its own (proposal_id null). A candidate's message waits for the coach (handled_at)
-- until she replies or marks it handled. Additive only.
create table if not exists messages (
  id integer generated always as identity primary key,
  candidate_id integer not null references candidates(id) on delete cascade,
  proposal_id integer references proposals(id) on delete set null,
  author text not null check (author in ('coach', 'candidate')),
  coach_id integer references coaches(id) on delete set null,
  body text not null,
  created_at timestamp not null default (now() at time zone 'utc'),
  handled_at timestamp
);
create index if not exists idx_messages_candidate on messages (candidate_id, id);
alter table messages enable row level security;
