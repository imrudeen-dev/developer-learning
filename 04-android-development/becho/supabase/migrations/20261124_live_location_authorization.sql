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
