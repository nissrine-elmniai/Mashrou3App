-- 0055 — icônes des groupes de discussion (bucket public chat-group-avatars)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-group-avatars',
  'chat-group-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture publique (bucket public)
drop policy if exists "chat_group_avatars_select_public" on storage.objects;
create policy "chat_group_avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'chat-group-avatars');

-- Écriture : uniquement l'admin du groupe, chemin {group_id}.jpg
drop policy if exists "chat_group_avatars_insert_admin" on storage.objects;
create policy "chat_group_avatars_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-group-avatars'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and private.is_chat_group_admin(split_part(name, '.', 1)::uuid)
  );

drop policy if exists "chat_group_avatars_update_admin" on storage.objects;
create policy "chat_group_avatars_update_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-group-avatars'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and private.is_chat_group_admin(split_part(name, '.', 1)::uuid)
  )
  with check (
    bucket_id = 'chat-group-avatars'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and private.is_chat_group_admin(split_part(name, '.', 1)::uuid)
  );

drop policy if exists "chat_group_avatars_delete_admin" on storage.objects;
create policy "chat_group_avatars_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-group-avatars'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and private.is_chat_group_admin(split_part(name, '.', 1)::uuid)
  );
