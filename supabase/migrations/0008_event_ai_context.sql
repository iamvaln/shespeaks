-- What a coach knows about an event, for the AI title suggestions (and later the candidate's space): the edition's theme,
-- a description, the formats the call for speakers accepts and the themes it expects (ids of the domains referential).
-- Lists are comma-separated ids; an empty value means « not stated », never « none accepted ». Additive only.
alter table devfest_events add column if not exists theme text;
alter table devfest_events add column if not exists description text;
alter table devfest_events add column if not exists accepted_formats text;
alter table devfest_events add column if not exists themes text;
