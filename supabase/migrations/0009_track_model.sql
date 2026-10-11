-- Which AI model wrote a suggestion (origin 'ia'): Claude or OpenAI, shown on the fiche next to « Suggestion IA ».
-- Null for every other track, and for the AI suggestions written before (all by Claude). Additive only.
alter table tracks add column if not exists model text;
