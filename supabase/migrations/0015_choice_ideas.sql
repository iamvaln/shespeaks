-- What she imagines when she chooses one of the tracks sent (asked in the same form as her choice: how she would approach it, what she
-- could show, the one thing to remember, what to prepare). The coach builds the plan from it. JSON, kept with her answer. Additive only.
alter table proposals add column if not exists response_data text;
