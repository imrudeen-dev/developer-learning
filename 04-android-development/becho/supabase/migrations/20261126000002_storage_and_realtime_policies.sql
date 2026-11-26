begin;

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view listing images" on storage.objects;
create policy "Anyone can view listing images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'listing-images');

drop policy if exists "Users upload images to their own folder" on storage.objects;
create policy "Users upload images to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update images in their own folder" on storage.objects;
create policy "Users update images in their own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete images in their own folder" on storage.objects;
create policy "Users delete images in their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
begin;

drop policy if exists "Becho chat participants can receive private location broadcasts"
  on realtime.messages;
create policy "Becho chat participants can receive private location broadcasts"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'becho-location'
    and (select auth.uid()::text) in (
      split_part((select realtime.topic()), ':', 3),
      split_part((select realtime.topic()), ':', 4)
    )
    and split_part((select realtime.topic()), ':', 3)
      <> split_part((select realtime.topic()), ':', 4)
    and exists (
      select 1
      from public.listings listing
      where listing.id::text = split_part((select realtime.topic()), ':', 2)
        and listing.seller_id::text in (
          split_part((select realtime.topic()), ':', 3),
          split_part((select realtime.topic()), ':', 4)
        )
    )
  );

drop policy if exists "Becho chat participants can send private location broadcasts"
  on realtime.messages;
create policy "Becho chat participants can send private location broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'becho-location'
    and (select auth.uid()::text) in (
      split_part((select realtime.topic()), ':', 3),
      split_part((select realtime.topic()), ':', 4)
    )
    and split_part((select realtime.topic()), ':', 3)
      <> split_part((select realtime.topic()), ':', 4)
    and exists (
      select 1
      from public.listings listing
      where listing.id::text = split_part((select realtime.topic()), ':', 2)
        and listing.seller_id::text in (
          split_part((select realtime.topic()), ':', 3),
          split_part((select realtime.topic()), ':', 4)
        )
    )
  );

commit;
