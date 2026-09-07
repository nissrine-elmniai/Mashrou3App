-- 0056_profiles_date_naissance.sql
-- Date de naissance sur profiles (édition self-service superviseur / membre).

alter table public.profiles
  add column if not exists date_naissance date;

notify pgrst, 'reload schema';
