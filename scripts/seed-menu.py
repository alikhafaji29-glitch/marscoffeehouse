"""Load the menu data into the database's menu_items table (both branches), through the one-time loader function
public.seed_menu_once. The function exists only while a load is being done: it is created with the hash of a fresh
token and dropped afterwards (see HANDOFF, decision 94).

    python scripts/seed-menu.py PATH_TO_TOKEN_FILE [all|names]

  all    every column from src/menuData.json (prices, stock, tag, flavours, nutrition, names, order, descriptions).
         It OVERWRITES what staff have changed: only for a first fill. Needs the loader of the 20261013000200 migration.
  names  names, order and descriptions only (the loader of the 20261013000300 migration): prices, stock, tags and
         nutrition stay as staff have them.

Reads the project URL and the publishable key from .env.local.
"""
import io, json, os, re, sys, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mode = sys.argv[2] if len(sys.argv) > 2 else 'names'
env = {}
for line in io.open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^(VITE_SUPABASE_\w+)=(.*)$', line.rstrip('\r\n'))
    if m: env[m.group(1)] = m.group(2).strip()
url, key = env['VITE_SUPABASE_URL'].rstrip('/'), env['VITE_SUPABASE_KEY']
token = io.open(sys.argv[1]).read().strip()
data = json.load(io.open(os.path.join(ROOT, 'src', 'menuData.json'), encoding='utf-8'))
heavy = json.load(io.open(os.path.join(ROOT, 'docs', 'live-menu', 'descriptions.json'), encoding='utf-8'))
rows = []
for branch in ('erbil', 'kirkuk'):
    for name, v in data[branch].items():
        description = {**({'en': v['d']} if v['d'] else {}), **heavy.get(branch, {}).get(name, {})}
        row = {'branch': branch, 'name': name, 'names': v['nm'], 'sort': v['s'], 'description': description}
        if mode == 'all':
            row.update({'category': v['c'], 'in_stock': not v['o'], 'prices': v['p'], 'sizes': v['z'], 'tag': v['t'], 'flavors': v['f'],
                        'nutrition': [{'size': s, 'flavor': f, **facts} for s, f, facts in v['n']]})
        rows.append(row)
req = urllib.request.Request(url + '/rest/v1/rpc/seed_menu_once', data=json.dumps({'token': token, 'rows': rows}).encode('utf-8'),
                             headers={'apikey': key, 'Content-Type': 'application/json'}, method='POST')
try:
    print('mode:', mode, '| rows sent:', len(rows), '| rows written:', urllib.request.urlopen(req, timeout=60).read().decode())
except urllib.error.HTTPError as e:
    sys.exit(f'failed: {e.code} {e.read().decode()[:300]}')
