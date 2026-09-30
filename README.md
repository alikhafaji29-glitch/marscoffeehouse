# Mars CoffeeHouse

A new-look, app-style website concept for Mars CoffeeHouse in Erbil: the menu, ordering with a basket and checkout,
and a set of drink games. It is available in English, Arabic (formal MSA) and Kurdish (Sorani), with full
right-to-left layout.

## What's inside

- **Home**: full-screen slides for Positive Hours, Lunch Hours, the new season, Build Your Drink, the shop and the
  Mars story.
- **Menu**: the live Erbil menu, with category tabs, search, item sheets with sizes and extras, and a basket.
- **Build Your Drink**:
  - *From your mood*: four quick questions pick two menu drinks and a bakery pairing.
  - *Be the barista*: six mini-games (Latte, Mojito, Milkshake, Smoothie, Matcha, Refreshers) where you make the
    drink step by step, then order the real menu item.
- **Community**: posts about drinks customers made, with hearts and comments.
- **Account (demo)**: phone sign-in, loyalty points, a wallet, gift cards and sending a drink to a friend. The data
  stays on the device.
- **Tell us in your words**: an AI barista that picks a menu drink from a sentence. It runs through a small
  server function (`supabase/functions/mood`) and only ever picks drinks from the menu.

## Run it

```bash
npm install
npm run dev      # http://localhost:1440
npm run build    # type-check and build to dist/
```

The AI answer box needs an Anthropic API key. In development, put it in `.env.local` as
`ANTHROPIC_API_KEY=...`; this file is git-ignored. On a live site, set `VITE_MOOD_API_URL` to the deployed mood
function instead. Everything else works without a key.

## Stack

React 18, TypeScript and Vite. The drawings (the barista games, the mood game's cup and the icons) are plain SVG,
and there are no other runtime dependencies.

This is a design concept, not the official Mars CoffeeHouse ordering site.
