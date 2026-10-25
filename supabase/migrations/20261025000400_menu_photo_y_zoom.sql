-- An item photo moved up / down and zoomed in its frame too (owner, 2026-10-25: "add both", after left / right in
-- 20261025000200). photo_y = how far, in % of the picture's height: negative = up, positive = down; photo_zoom = its size
-- in %: 100 / null = as it is, under 100 smaller, over 100 bigger.
alter table public.menu_items add column if not exists photo_y smallint check (photo_y between -40 and 40);
alter table public.menu_items add column if not exists photo_zoom smallint check (photo_zoom between 50 and 200);
grant insert (photo_y, photo_zoom) on public.menu_items to authenticated;
grant update (photo_y, photo_zoom) on public.menu_items to authenticated;
