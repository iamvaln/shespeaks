-- Which AI wrote a suggestion (origin 'ia'): the provider (claude | openai), which decides what a new request replaces, and the
-- model, shown on the fiche next to « Suggestion IA ». Null for every other track, and for the AI suggestions written before (all by
-- Claude). Additive only.
alter table tracks add column if not exists provider text;
alter table tracks add column if not exists model text;
