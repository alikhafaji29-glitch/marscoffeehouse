-- What an item offers besides its own "choose one" flavours (owner, 2026-10-26: "the owner chooses which item has add
-- ons, and which have flavours, and chooses what add ons and what flavours"): opts = { pumps: [flavour ids], pumpMax,
-- addons: [add-on item names], milk: true/false }. Null = the rules used until now (milk drinks and black coffees).
alter table public.menu_items add column if not exists opts jsonb;
grant insert (opts) on public.menu_items to authenticated;
grant update (opts) on public.menu_items to authenticated;
