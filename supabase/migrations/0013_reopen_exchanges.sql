-- « Rouvrir les échanges » on the coach fiche: once set, only her own confirmation (submitted_at) counts as submitted, not the form
-- answer or the status, so the coach can send again (another photo, a corrected subject) until she confirms again. Additive only.
alter table candidates add column if not exists reopened_at timestamp;
