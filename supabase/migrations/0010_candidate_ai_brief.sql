-- A coach's notes for the AI title suggestions of one candidate (« Précisions pour l'IA » on her fiche): kept so every new request,
-- with Claude or OpenAI, reuses them, and another coach sees what was asked. Never shown to the candidate. Additive only.
alter table candidates add column if not exists ai_brief text;
