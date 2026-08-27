-- À coller dans Supabase → SQL Editor, puis Run.
-- MIGRATION 0016 — types de tests (اختبار الحفظ / حفاظ السنة)
-- À exécuter après supabase/migrations/0015_test_invitations_cascade.sql
--
-- اختبار الحفظ : date + quantité de Coran à évaluer
-- حفاظ السنة  : date + lien Google Form

alter table public.tests
  add column if not exists type text not null default 'hifz'
  check (type in ('hifz', 'sunnah'));

alter table public.tests
  add column if not exists date_test date;

alter table public.tests
  add column if not exists quran_quantity text;

alter table public.tests
  add column if not exists form_url text;

create index if not exists tests_type_idx on public.tests (type);
create index if not exists tests_date_test_idx on public.tests (date_test);

notify pgrst, 'reload schema';
