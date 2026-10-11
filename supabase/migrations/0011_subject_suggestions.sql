-- The AI's proposal to improve a candidate's subject (« Améliorer avec Claude / OpenAI » in « Sujet retenu »): three titles, an
-- abstract, how to approach the talk and a note for the coach. One per candidate: a new request replaces it. Lists are JSON arrays.
create table if not exists subject_suggestions (
  candidate_id integer primary key references candidates(id) on delete cascade,
  provider text not null,
  model text not null,
  titles text not null,
  abstract text not null,
  plan text not null,
  note text,
  created_at timestamp not null default (now() at time zone 'utc')
);
alter table subject_suggestions enable row level security;
