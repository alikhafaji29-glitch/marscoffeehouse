# Based On Your Mood — question sets by time of day

Status: **agreed with the owner and built** (2026-09-29, `src/mood.ts` POOLS + `MoodGame.tsx`). **The game has 4 questions — the coffee question was dropped;
see "Agreed design: 4 questions" at the end. The 5-question sets below are kept as the history it came from.** Rebalanced the same day for the **51 drinks**
the live Erbil menu really has (19 drinks Mars no longer sells were removed from the site); out-of-stock drinks stay in. The game today still asks the old four questions
(What's going on? · Sugar? · Temperature? · Milk?) at every hour.

The day has three sets of questions, following the site's own day:

| Set | Hours | Same as |
|---|---|---|
| Morning | 05:00–12:00 | Positive Hours |
| Afternoon | 12:00–17:00 | Lunch Hours |
| Night | 17:00–05:00 | the night reel |

## Fairness rules (all sets)

1. Every drink on the menu (51 on the live Erbil menu, 2026-09-29) belongs to exactly one first answer, so each has the same chance.
2. Inside every coffee × temperature × milk group, the first answers get equal shares.
3. A group with fewer than 4 drinks is shared by all first answers (it cannot be split fairly).
4. Sweetness never removes drinks. It decides which drinks go into the draw (the closest sweetness first) and then what
   happens to the drink the customer picks (owner, 2026-09-29):
   - **Drink sweeter than asked** → made less sweet; the order line says "no sugar" or "less sweet".
   - **Drink as sweet as asked** → made as usual.
   - **Drink less sweet than asked** → made as usual, **no sugar added**; a sweet from the bakery is offered with it:

     | Drink | A little | Sweet |
     |---|---|---|
     | Coffee (incl. Turkish Coffee, Karak Chai) | Banana Bread 3,500 | San Sebastian 6,500 |
     | Matcha | Croissant Pistachio 5,500 | Cheesecake Strawberry 6,500 |
     | Juices, iced teas, mojitos, smoothies | Cookies New York 3,500 | Mango Mousse Cake 6,500 |

   On most paths (all but 3–4 of the 28 per period) the final list is 1–3 drinks of the same sweetness, so the answer
   changes what comes with the drink rather than which drinks are picked — e.g. Cold Brew / Iced Americano + "Sweet"
   → Iced Americano + San Sebastian.
5. Milk is only asked as **Milk or No milk** — no milk type question (owner, 2026-09-29). A customer who wants oat or
   lactose-free milk changes it on the drink's page / order as usual.
6. If an answer would lead nowhere, the question is skipped: **No coffee + Hot** has no drink without milk, so
   "Milk?" is not asked at all on that path.
7. The reveal shows two picks drawn at random from the final list — from two different menu categories whenever the
   list has more than one (owner, 2026-09-29).

## Morning set (5-question version, agreed 2026-09-29, superseded by the 4 questions)

1. **How is your morning?** — Starting a new project · Still waking up · Taking it easy · Relaxing
2. **Coffee in your drink?** — With coffee · No coffee
3. **Hot or cold?** — Hot · Cold
4. **Milk?** — No milk · With milk (no milk-type question)
5. **How sweet do you want it?** — No sugar · A little · Sweet (see rule 4: less sweet, as made, or + a sweet from the bakery)

Karak Chai, the matchas and Energy + count as "no coffee". Out-of-stock drinks (Filter Coffee, Cold Brew, Mint-Lemon
Mojito, the three matchas on 2026-09-29) are included, as the owner asked.

### The menu after questions 2–4 (51 drinks)

| Coffee | Temp | Milk | Drinks |
|---|---|---|---|
| Coffee | Hot | No milk | 6 |
| Coffee | Hot | Milk | 11 |
| Coffee | Cold | No milk | 2 — shared by all four answers |
| Coffee | Cold | Milk | 7 |
| No coffee | Hot | Milk | 7 |
| No coffee | Hot | No milk | 0 — question skipped |
| No coffee | Cold | No milk | 12 |
| No coffee | Cold | Milk | 6 |

### Drinks per first answer

| Group | Starting a new project | Still waking up | Taking it easy | Relaxing |
|---|---|---|---|---|
| Coffee · hot · no milk | Espresso Doppio, Turkish Coffee Double | Espresso, Americano | Filter Coffee | Turkish Coffee |
| Coffee · hot · milk | Cortado, Flat White, Mocha Dark | Latte Classic, Classic Cappuccino | Latte with Flavor, Cappuccino with Flavors, Hot Spanish Latte | Latte Caramel, Cappuccino Caramel, Mocha White |
| Coffee · cold · no milk | Cold Brew, Iced Americano (shared) | (shared) | (shared) | (shared) |
| Coffee · cold · milk | Iced Dark Chocolate Mocha | Iced Classic Latte, Ice Latte Caramel | Iced Latte with Flavor, Iced Spanish Latte | Mars Spanish Latte Signature, Iced White Chocolate Mocha |
| No coffee · hot | Classic Matcha, Mid-Night Matcha | Karak Chai | Berry Matcha, Hot Pistachio | Hot Lotus, Hot Chocolate |
| No coffee · cold · no milk | Energy +, Iced Mango Tea, Passion Fruit Smoothie | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Lemon-Mint Mojito | Iced Peach Tea, Mango with Orange Smoothie, Strawberry Smoothie | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito |
| No coffee · cold · milk | Oreo Milkshake | Strawberry Milkshake, Rashi Milkshake | Pistachio Milkshake | Lotus Milkshake, Nutella Milkshake |
| **Own drinks (+2 shared)** | 12 | 12 | 12 | 13 |

### Wording (Arabic formal MSA · Sorani Kurdish — drafts, Kurdish to be checked by a native speaker)

| Key | English | Arabic | Kurdish |
|---|---|---|---|
| Q1 | How is your morning? | كيف يبدو صباحك؟ | بەیانیت چۆنە؟ |
| | Starting a new project | أبدأ مشروعًا جديدًا | پڕۆژەیەکی نوێ دەست پێدەکەم |
| | Still waking up | ما زلت أستيقظ | هێشتا خەبەرم دەبێتەوە |
| | Taking it easy | على مهلي | لەسەرخۆم |
| | Relaxing | أسترخي | پشوو دەدەم |
| Q2 | Coffee in your drink? | هل تريد قهوة في مشروبك؟ | قاوە لە خواردنەوەکەتدا بێت؟ |
| | With coffee | مع قهوة | لەگەڵ قاوە |
| | No coffee | بدون قهوة | بێ قاوە |
| Q3 | Hot or cold? | ساخن أم بارد؟ | گەرم یان سارد؟ |
| | Hot · Cold | ساخن · بارد | گەرم · سارد |
| Q4 | Milk? | الحليب؟ (existing) | شیر؟ (existing) |
| | No milk · With milk | بدون حليب (existing) · مع حليب | بێ شیر (existing) · لەگەڵ شیر |
| Q5 | How sweet do you want it? | ما مقدار الحلاوة التي تريدها؟ | چەند شیرینت دەوێت؟ |
| | No sugar · A little · Sweet | بدون سكر · قليل · حلو | بێ شەکر · کەمێک · شیرین |

## Afternoon set (5-question version, agreed 2026-09-29, superseded by the 4 questions)

1. **How's your afternoon?** — Afternoon slump · Lunch break · Back to work · Out with friends
2–5. Same as the morning: Coffee in your drink? · Hot or cold? · Milk? (milk or no milk; skipped for No coffee + Hot) ·
How sweet do you want it?

### Drinks per first answer

| Group | Afternoon slump | Lunch break | Back to work | Out with friends |
|---|---|---|---|---|
| Coffee · hot · no milk | Espresso Doppio, Turkish Coffee Double | Espresso | Americano, Filter Coffee | Turkish Coffee |
| Coffee · hot · milk | Cortado, Mocha Dark | Latte Classic, Classic Cappuccino, Cappuccino Caramel | Flat White, Latte with Flavor, Cappuccino with Flavors | Hot Spanish Latte, Latte Caramel, Mocha White |
| Coffee · cold · no milk | Cold Brew, Iced Americano (shared) | (shared) | (shared) | (shared) |
| Coffee · cold · milk | Iced Dark Chocolate Mocha | Iced Classic Latte, Iced Latte with Flavor | Ice Latte Caramel, Iced Spanish Latte | Mars Spanish Latte Signature, Iced White Chocolate Mocha |
| No coffee · hot | Mid-Night Matcha, Karak Chai | Classic Matcha | Berry Matcha, Hot Pistachio | Hot Lotus, Hot Chocolate |
| No coffee · cold · no milk | Energy +, Iced Mango Tea, Iced Peach Tea | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Lemon-Mint Mojito | Mango with Orange Smoothie, Passion Fruit Smoothie, Strawberry Smoothie | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito |
| No coffee · cold · milk | Oreo Milkshake, Nutella Milkshake | Strawberry Milkshake, Rashi Milkshake | Pistachio Milkshake | Lotus Milkshake |
| **Own drinks (+2 shared)** | 12 | 12 | 13 | 12 |

### Wording (drafts; Kurdish to be checked)

| English | Arabic | Kurdish |
|---|---|---|
| How's your afternoon? | كيف تمضي ظهيرتك؟ | دوای نیوەڕۆت چۆنە؟ |
| Afternoon slump | خمول بعد الظهر | ماندوویی دوای نیوەڕۆ |
| Lunch break | استراحة الغداء | پشووی نانی نیوەڕۆ |
| Back to work | عائد إلى العمل | گەڕانەوە بۆ کار |
| Out with friends | مع الأصدقاء | لەگەڵ هاوڕێکان |

## Night set (5-question version, agreed 2026-09-29, superseded by the 4 questions)

1. **How's your night going?** — Winding down · Out with friends · Studying late · Sweet craving
2–5. Same as the morning: Coffee in your drink? · Hot or cold? · Milk? (milk or no milk; skipped for No coffee + Hot) ·
How sweet do you want it?

Late-night coffee: **option B** — the customer always chooses coffee or no coffee, at any hour (the old "no caffeine
after 21:00" pools are dropped).

### Drinks per first answer

| Group | Winding down | Out with friends | Studying late | Sweet craving |
|---|---|---|---|---|
| Coffee · hot · no milk | Filter Coffee | Turkish Coffee, Turkish Coffee Double | Espresso Doppio, Espresso | Americano |
| Coffee · hot · milk | Latte Classic, Classic Cappuccino, Hot Spanish Latte | Latte with Flavor, Cappuccino with Flavors, Mocha Dark | Flat White, Cortado | Latte Caramel, Cappuccino Caramel, Mocha White |
| Coffee · cold · no milk | Cold Brew, Iced Americano (shared) | (shared) | (shared) | (shared) |
| Coffee · cold · milk | Iced Latte with Flavor, Iced Spanish Latte | Mars Spanish Latte Signature, Ice Latte Caramel | Iced Classic Latte, Iced Dark Chocolate Mocha | Iced White Chocolate Mocha |
| No coffee · hot | Karak Chai, Hot Pistachio | Berry Matcha | Mid-Night Matcha, Classic Matcha | Hot Lotus, Hot Chocolate |
| No coffee · cold · no milk | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Iced Peach Tea | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito | Energy +, Iced Mango Tea, Lemon-Mint Mojito | Strawberry Smoothie, Mango with Orange Smoothie, Passion Fruit Smoothie |
| No coffee · cold · milk | Pistachio Milkshake | Strawberry Milkshake, Rashi Milkshake | Oreo Milkshake | Lotus Milkshake, Nutella Milkshake |
| **Own drinks (+2 shared)** | 12 | 13 | 12 | 12 |

### Wording (drafts; Kurdish to be checked)

| English | Arabic | Kurdish |
|---|---|---|
| How's your night going? | كيف تمضي ليلتك؟ | شەوت چۆن دەڕوات؟ |
| Winding down | أختم يومي بهدوء | ڕۆژەکەم بە هێمنی تەواو دەکەم |
| Out with friends | سهرة مع الأصدقاء | شەو لەگەڵ هاوڕێکان |
| Studying late | أدرس حتى وقت متأخر | تا درەنگ دەخوێنم |
| Sweet craving | رغبة في شيء حلو | ئارەزووی شتێکی شیرین |

## Agreed design: 4 questions — no coffee question (owner, 2026-09-29) — THIS IS WHAT GETS BUILT

The owner tried the game without **"Coffee in your drink?"** and kept it: **Q1 mood · Hot or cold? · Milk? · How sweet do
you want it?** The morning / afternoon / night first questions and answers stay as above; rules 1–5 and 7 still apply;
rule 3 (shared group) and rule 6 (skipped milk question) no longer apply — every path has at least one drink and
nothing is shared. Hot/cold × milk gives four groups; every drink keeps its first answer from the 5-question sets, except
three morning moves to keep the groups even (Cappuccino Caramel → Still waking up, Ice Latte Caramel → Starting a new
project, Passion Fruit Smoothie → Taking it easy). Cold Brew and Iced Americano get one answer each.

| Group | Drinks | Per answer (morning · afternoon · night) |
|---|---|---|
| Hot · no milk | 6 | 2/2/1/1 · 2/1/2/1 · 1/2/2/1 |
| Hot · milk | 18 | 5/4/5/4 · 4/4/5/5 · 5/4/4/5 |
| Cold · no milk | 14 | 3/4/4/3 · 4/4/3/3 · 4/3/4/3 |
| Cold · milk | 13 | 3/3/3/4 · 3/4/3/3 · 3/4/3/3 |

16 paths per period; all 51 drinks placed once per period (13/13/13/12 per answer). Sweetness changes the picks on
5 / 6 / 5 paths. Known trade-offs the owner accepted: a customer can't ask for "no coffee" (e.g. Winding down · Hot ·
No milk at night = Filter Coffee), and milkshakes share groups with sweet iced lattes, so "No sugar" there ends at
"made less sweet".

### Morning — How is your morning? (05:00–12:00)

| Group | Starting a new project | Still waking up | Taking it easy | Relaxing |
|---|---|---|---|---|
| Hot · no milk | Espresso Doppio, Turkish Coffee Double | Espresso, Americano | Filter Coffee | Turkish Coffee |
| Hot · milk | Cortado, Flat White, Mocha Dark, Classic Matcha, Mid-Night Matcha | Latte Classic, Classic Cappuccino, Karak Chai, Cappuccino Caramel | Latte with Flavor, Cappuccino with Flavors, Hot Spanish Latte, Berry Matcha, Hot Pistachio | Latte Caramel, Mocha White, Hot Lotus, Hot Chocolate |
| Cold · no milk | Energy +, Iced Mango Tea, Cold Brew | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Lemon-Mint Mojito, Iced Americano | Iced Peach Tea, Mango with Orange Smoothie, Strawberry Smoothie, Passion Fruit Smoothie | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito |
| Cold · milk | Iced Dark Chocolate Mocha, Oreo Milkshake, Ice Latte Caramel | Iced Classic Latte, Strawberry Milkshake, Rashi Milkshake | Iced Latte with Flavor, Iced Spanish Latte, Pistachio Milkshake | Mars Spanish Latte Signature, Iced White Chocolate Mocha, Lotus Milkshake, Nutella Milkshake |
| **Drinks** | 13 | 13 | 13 | 12 |

### Afternoon — How's your afternoon? (12:00–17:00)

| Group | Afternoon slump | Lunch break | Back to work | Out with friends |
|---|---|---|---|---|
| Hot · no milk | Espresso Doppio, Turkish Coffee Double | Espresso | Americano, Filter Coffee | Turkish Coffee |
| Hot · milk | Cortado, Mocha Dark, Mid-Night Matcha, Karak Chai | Latte Classic, Classic Cappuccino, Cappuccino Caramel, Classic Matcha | Flat White, Latte with Flavor, Cappuccino with Flavors, Berry Matcha, Hot Pistachio | Hot Spanish Latte, Latte Caramel, Mocha White, Hot Lotus, Hot Chocolate |
| Cold · no milk | Energy +, Iced Mango Tea, Iced Peach Tea, Cold Brew | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Lemon-Mint Mojito, Iced Americano | Mango with Orange Smoothie, Passion Fruit Smoothie, Strawberry Smoothie | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito |
| Cold · milk | Iced Dark Chocolate Mocha, Oreo Milkshake, Nutella Milkshake | Iced Classic Latte, Iced Latte with Flavor, Strawberry Milkshake, Rashi Milkshake | Ice Latte Caramel, Iced Spanish Latte, Pistachio Milkshake | Mars Spanish Latte Signature, Iced White Chocolate Mocha, Lotus Milkshake |
| **Drinks** | 13 | 13 | 13 | 12 |

### Night — How's your night going? (17:00–05:00)

| Group | Winding down | Out with friends | Studying late | Sweet craving |
|---|---|---|---|---|
| Hot · no milk | Filter Coffee | Turkish Coffee, Turkish Coffee Double | Espresso Doppio, Espresso | Americano |
| Hot · milk | Latte Classic, Classic Cappuccino, Hot Spanish Latte, Karak Chai, Hot Pistachio | Latte with Flavor, Cappuccino with Flavors, Mocha Dark, Berry Matcha | Flat White, Cortado, Mid-Night Matcha, Classic Matcha | Latte Caramel, Cappuccino Caramel, Mocha White, Hot Lotus, Hot Chocolate |
| Cold · no milk | Fresh Orange Juice, Orange Pomegranate Fresh Juice, Iced Peach Tea, Iced Americano | Strawberry Mojito, Watermelon Mojito, Pomegranate Mojito | Energy +, Iced Mango Tea, Lemon-Mint Mojito, Cold Brew | Strawberry Smoothie, Mango with Orange Smoothie, Passion Fruit Smoothie |
| Cold · milk | Iced Latte with Flavor, Iced Spanish Latte, Pistachio Milkshake | Mars Spanish Latte Signature, Ice Latte Caramel, Strawberry Milkshake, Rashi Milkshake | Iced Classic Latte, Iced Dark Chocolate Mocha, Oreo Milkshake | Iced White Chocolate Mocha, Lotus Milkshake, Nutella Milkshake |
| **Drinks** | 13 | 13 | 13 | 12 |
