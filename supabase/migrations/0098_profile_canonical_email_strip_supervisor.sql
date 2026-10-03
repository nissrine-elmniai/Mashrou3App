-- 0098 — profile_canonical_email retire « +supervisor » au lieu de le
-- remplacer par « @ ».
--
-- L'ancienne fonction (0029) faisait
--   regexp_replace(email, '\+supervisor(?=@)', '@')
-- donc ahmed+supervisor@gmail.com devenait ahmed@@gmail.com.
-- Ici « +supervisor@ » est remplacé par « @ » :
--   ahmed+supervisor@gmail.com → ahmed@gmail.com
--
-- profiles.email (adresse Auth, suffixe +supervisor) n'est pas modifié.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

begin;

create or replace function public.profile_canonical_email(p_email text, p_canonical text)
returns text
language sql
immutable
as $$
  select lower(
    coalesce(
      nullif(trim(p_canonical), ''),
      regexp_replace(trim(coalesce(p_email, '')), '\+supervisor@', '@', 'i')
    )
  );
$$;

-- Recalcule seulement les canoniques vides, encore suffixés, ou cassés en @@.
update public.profiles
set canonical_email = public.profile_canonical_email(email, null)
where email ~* '\+supervisor@'
  and (
    canonical_email is null
    or btrim(canonical_email) = ''
    or canonical_email ~* '\+supervisor@'
    or canonical_email like '%@@%'
  );

notify pgrst, 'reload schema';

commit;
