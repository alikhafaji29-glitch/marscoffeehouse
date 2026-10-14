-- The menu per branch gains what the live menu has beyond English: each item's name in English, Arabic and Kurdish
-- as that branch writes it, and its place on the branch's menu.
-- Filled on 2026-10-13 from the live site's three language versions (scripts/read-live-names.mjs,
-- scripts/build-menu-data.py, then `python scripts/seed-menu.py TOKEN_FILE names` through a one-time loader function
-- that updated names, sort and description only and was dropped afterwards).
alter table public.menu_items add column if not exists names jsonb not null default '{}'::jsonb;   -- { en, ar, ku }
alter table public.menu_items add column if not exists sort integer not null default 0;           -- order within the branch's menu
