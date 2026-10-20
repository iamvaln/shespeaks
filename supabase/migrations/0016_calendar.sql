-- The common calendar. A candidate the team admits after the last day to send an interest keeps her form open (admitted_late_at), and every
-- calendar reminder is written once in calendar_reminders (the key holds the date it aims at, so a change of date arms it again). Additive only.
alter table candidates add column if not exists admitted_late_at timestamp;

create table if not exists calendar_reminders (
  candidate_id integer not null references candidates(id) on delete cascade,
  key text not null,
  sent_at timestamp not null default (now() at time zone 'utc'),
  primary key (candidate_id, key)
);
alter table calendar_reminders enable row level security;
