-- The speaker photo is no longer a screen of the interest form (it comes with the preparation of the submission,
-- from the roadmap). A candidate who stopped on that screen has answered everything else: put her back on the
-- last screen of her branch, where the button now reads "Envoyer mon intérêt". Data only, safe to run once.
update candidates
   set current_screen = case branch when 'A' then 'a2' when 'B' then 'b2' when 'C' then 'c2' when 'D' then 'd2' end
 where current_screen = 'photo' and completed_at is null and branch in ('A', 'B', 'C', 'D');
