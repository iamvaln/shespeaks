-- "heure non précisée" was only a placeholder note on the Douala call-for-speakers closing date: it told candidates
-- nothing, so the roadmap now shows the date alone. Data only, and only where the note is still exactly that placeholder:
-- a precision a coach typed in Admin → Événements is never touched.
update devfest_events set cfp_close_note = null where cfp_close_note = 'heure non précisée';
