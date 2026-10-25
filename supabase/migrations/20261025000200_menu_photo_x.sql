-- An item photo moved left or right in its frame (owner, 2026-10-25: "adjusting items images, moving it left and right").
-- photo_x = how far, in % of the picture's width: negative = left, positive = right, 0 / null = centred as before.
alter table public.menu_items add column if not exists photo_x smallint check (photo_x between -40 and 40);
grant insert (photo_x) on public.menu_items to authenticated;
grant update (photo_x) on public.menu_items to authenticated;
