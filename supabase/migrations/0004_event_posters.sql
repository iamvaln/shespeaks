-- Official call-for-speakers posters supplied by the organisers (served from /public/events).
-- Data only, and only where no poster is set yet: a poster chosen in Admin → Événements is never replaced,
-- and since a migration runs once, a poster a coach later removes stays removed.
update devfest_events set poster_url = '/events/devfest-yaounde-2026.jpg' where city = 'yaounde' and poster_url is null;
update devfest_events set poster_url = '/events/devfest-douala-2026.jpg'  where city = 'douala'  and poster_url is null;
