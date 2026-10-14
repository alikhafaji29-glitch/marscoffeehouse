"""Turn the live menus read from marscoffeehouse.com into the site's menu data, per branch.

Inputs (docs/live-menu/):
  <branch>-<day>.json            scripts/read-live-menu.mjs: every item's sizes, prices, flavours, nutrition (English)
  names/<branch>-<lang>.json     scripts/read-live-names.mjs: the same menu in en / ar / ku: category names, item
                                 names, descriptions, the order of categories and items, the picture addresses
Outputs:
  src/menuData.json              bundled with the site: per branch and item the prices per size, sizes, tag, stock,
                                 names in three languages, the English description, flavours, nutrition per size and
                                 flavour, the item's place in its category; and the category names per branch
  docs/live-menu/descriptions.json   the Arabic and Kurdish descriptions (database only: too heavy for the bundle)

    python scripts/build-menu-data.py [YYYY-MM-DD of the reading, default 2026-10-13]

Every live item must exist in the catalogue (src/menu.ts): an unknown name stops the script.
"""
import io, json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAY = sys.argv[1] if len(sys.argv) > 1 else '2026-10-13'
LIVE = os.path.join(ROOT, 'docs', 'live-menu')

# the catalogue: names and categories, in the site's order
src = io.open(os.path.join(ROOT, 'src', 'menu.ts'), encoding='utf-8').read()
catalogue = {}  # UPPER name -> (name, category)
cat = None
for line in src.split('\n'):
    m = re.search(r"^\s+id: '(\w+)'", line)
    if m: cat = m.group(1); continue
    m = re.search(r"\{ name: '([^']+)', price:", line)
    if m and cat: catalogue[m.group(1).upper()] = (m.group(1), cat)

# the live site's spelling -> the catalogue's key
ALIAS = {
    'MINT - LEMON MOJITO': 'LEMON-MINT MOJITO',
    'CAPPUCCINO CLASSIC': 'CLASSIC CAPPUCCINO', 'LATTE WITH FLAVOUR': 'LATTE WITH FLAVOR', 'ICED LATTE WITH FLAVORS': 'ICED LATTE WITH FLAVOR',
    'ICED MOCHA WHITE CHOCOLATE': 'ICED WHITE CHOCOLATE MOCHA', 'ICED MANGO-PEACH TEA': 'ICED MANGO TEA', 'MID NIGHT MATCHA': 'MID-NIGHT MATCHA',
}
LIVECAT = {'COFFEE & MORE': 'coffeeMore', 'COFFEE WITH MILK': 'coffeeMilk', 'COLD COFFEE WITH MILK': 'coldCoffee', 'COLD COFFEE DRINKS': 'coldCoffee', 'REFRESHERS': 'refreshers',
           'MILK SHAKE': 'milkshake', 'MOJITO': 'mojito', 'SMOOTHIE': 'smoothie', 'ADD-ONS': 'extra', 'MATCHA COLLECTION': 'matcha', 'AUTUMN DRINKS': 'autumn',
           'BAKERY & DESSERTS': 'sweets', 'SANDWICHES & SALADS': 'savory'}
FACT = {'Energy': 'energy', 'Fat': 'fat', 'Sat Fat': 'satFat', 'Carbs': 'carbs', 'Sugar': 'sugar', 'Fibre': 'fibre', 'Protein': 'protein', 'Salt': 'salt', 'Caffeine': 'caffeine'}
FLAVOR = {'hazlenut': 'Hazelnut', 'caramel free sugar': 'Caramel free sugar', 'caramel free suger': 'Caramel free sugar'}
FLAVOR_ORDER = ['Vanilla', 'Hazelnut', 'Cookies', 'Brownie', 'Caramel free sugar', 'Caramel', 'Plain', 'Medium', 'Sweet']
TAG = {'TOP SELLER': 'top', 'PREMIUM': 'premium', 'SIGNATURE': 'signature'}
oz = lambda s: int(re.sub(r'\D', '', s)) if s else 0
def num(s):
    m = re.search(r'[\d.]+', str(s).replace(',', ''))
    return (float(m.group(0)) if '.' in m.group(0) else int(m.group(0))) if m else None
flav = lambda f: FLAVOR.get(f.strip().lower(), f.strip()[:1].upper() + f.strip()[1:]) if f else ''
forder = lambda f: FLAVOR_ORDER.index(f) if f in FLAVOR_ORDER else 99
key = lambda name: ALIAS.get(name.upper(), name.upper())
# a category the live site wrote in capitals reads better in the menu's tabs as ordinary words
tidy = lambda s: (s.title().replace('-Ons', '-ons') if s.isupper() else s)
SMALL = {'with', 'and', 'of', 'the'}
def tidy_name(s):
    """The live site stores some English names in odd case ("mint - lemon mojito", "cappuccino Classic") and shows them
    in capitals. Ours are not in capitals, so: every word capitalised, the small joining words left small."""
    def cap(w):
        i = next((k for k, ch in enumerate(w) if ch.isalpha()), None)
        return w if i is None else w[:i] + w[i].upper() + w[i + 1:]
    words = s.split()
    return ' '.join(w.lower() if k and w.lower() in SMALL else '-'.join(cap(p) for p in w.split('-')) for k, w in enumerate(words))

def detail(x):
    """flavours and nutrition entries of an item whose window opened"""
    entries = []
    for v in x['variants']:
        facts = {FACT[k]: num(val) for k, val in v['nutrition'].items() if k in FACT and num(val) is not None}
        if facts: entries.append([v['size'] or '', flav(v['flavor']), facts])
    entries.sort(key=lambda e: (oz(e[0]), forder(e[1])))
    return {'f': sorted({flav(f) for f in x.get('flavors', [])}, key=forder), 'n': entries}

full = {b: json.load(io.open(os.path.join(LIVE, f'{b}-{DAY}.json'), encoding='utf-8'))['items'] for b in ('erbil', 'kirkuk')}
names = {b: {l: json.load(io.open(os.path.join(LIVE, 'names', f'{b}-{l}.json'), encoding='utf-8')) for l in ('en', 'ar', 'ku')} for b in full}
opened = {b: {key(x['name']): x for x in full[b] if not x.get('noModal')} for b in full}
# descriptions by catalogue key, from whichever branch could open the item
desc = {b: {} for b in full}
for b in full:
    en = names[b]['en']['items']
    for l in ('en', 'ar', 'ku'):
        items = names[b][l]['items']
        assert len(items) == len(en) and all(a['image'] == e['image'] and (a['cat'], a['index']) == (e['cat'], e['index']) for a, e in zip(items, en)), f'{b} {l}: the languages do not line up'
        for a, e in zip(items, en):
            # a description the live site left in English is not a translation
            if a.get('desc') and (l == 'en' or a['desc'] != e.get('desc')): desc[b].setdefault(key(e['name']), {})[l] = a['desc']

out, cats, heavy = {}, {}, {}
for b in full:
    other = 'kirkuk' if b == 'erbil' else 'erbil'
    en, ar, ku = (names[b][l] for l in ('en', 'ar', 'ku'))
    assert len(en['items']) == len(full[b]), f'{b}: the two readings have a different number of items'
    cats[b] = {LIVECAT[c['name'].upper()]: {'en': tidy_name(tidy(c['name'])).replace('Add-Ons', 'Add-ons'), 'ar': ar['cats'][i]['name'], 'ku': ku['cats'][i]['name']} for i, c in enumerate(en['cats'])}
    listed = {key(x['name']): x for x in full[b]}
    rows, heavy[b] = {}, {}
    for pos, e in enumerate(en['items']):
        k = key(e['name'])
        if k not in catalogue: sys.exit(f"{b}: '{e['name']}' is on the live menu but not in src/menu.ts. Add it to the catalogue (or to ALIAS) first.")
        name, cat = catalogue[k]
        x = listed[k]
        prices = sorted([(m.group(2) or '', int(m.group(1).replace(',', ''))) for m in re.finditer(r'([\d,]+) IQD(?: \((\d+oz)\))?', x['listText'])], key=lambda p: oz(p[0]))
        tag = next((t for label, t in TAG.items() if x['listText'].startswith(label)), None)
        src_item = x if not x.get('noModal') else opened[other].get(k)  # out of stock = does not open: take the other branch's
        det = detail(src_item) if src_item else {'f': [], 'n': []}
        d = {**desc[other].get(k, {}), **desc[b].get(k, {})}
        rows[name] = {'c': cat, 's': pos, 'nm': {'en': name if e['name'].upper() == name.upper() else tidy_name(e['name']), 'ar': ar['items'][pos]['name'], 'ku': ku['items'][pos]['name']},
                      'p': [p for _, p in prices], 'z': [s for s, _ in prices if s], 't': tag, 'o': 1 if x['out'] else 0, 'd': d.get('en', ''), **det}
        if d.get('ar') or d.get('ku'): heavy[b][name] = {l: d[l] for l in ('ar', 'ku') if d.get(l)}
    out[b] = {catalogue[k][0]: rows[catalogue[k][0]] for k in catalogue if catalogue[k][0] in rows}

path = os.path.join(ROOT, 'src', 'menuData.json')
io.open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps({'readOn': DAY, 'cats': cats, **out}, ensure_ascii=False, separators=(',', ':')) + '\n')
io.open(os.path.join(LIVE, 'descriptions.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(heavy, ensure_ascii=False, indent=1) + '\n')
for b in out:
    r = out[b]
    print(f"{b}: {len(r)} items | out of stock {sum(v['o'] for v in r.values())} | English description {sum(1 for v in r.values() if v['d'])} | Arabic {sum(1 for v in heavy[b].values() if v.get('ar'))} | Kurdish {sum(1 for v in heavy[b].values() if v.get('ku'))} | nutrition {sum(1 for v in r.values() if v['n'])} | flavours {sum(1 for v in r.values() if v['f'])}")
print('in the catalogue but on neither live menu:', [catalogue[k][0] for k in catalogue if catalogue[k][0] not in out['erbil'] and catalogue[k][0] not in out['kirkuk']])
print('wrote', path, os.path.getsize(path), 'bytes; descriptions.json', os.path.getsize(os.path.join(LIVE, 'descriptions.json')), 'bytes')
