-- Candidates take part in EVENTS (DevFest Douala 2026, DevFest Yaoundé 2026, ...), not in cities.
-- `name` stays the city/place; `title` is the event's public name; `poster_url` its call-for-speakers visual.
-- Additive only (safe while previews and production share one database).
alter table devfest_events add column if not exists title text;
alter table devfest_events add column if not exists poster_url text;

update devfest_events
   set title = 'DevFest ' || name || coalesce(' ' || nullif(substr(event_date, 1, 4), ''), '')
 where title is null;

-- DevFest Douala's official call-for-speakers link (from its poster) replaces the first seeded value,
-- only where nobody has edited it since.
update devfest_events
   set submission_url = 'https://bit.ly/speakersdevfest26',
       submission_label = 'bit.ly/speakersdevfest26 (devfest.gdgdouala.org/cfp)'
 where city = 'douala' and submission_url = 'https://devfest.gdgdouala.org/cfp';
