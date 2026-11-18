"""MidLab: cache official Riot icons and Leaguepedia profile image URLs.
Run from the repository: python -u scripts/update_visuals.py
Does not modify pro-matches.json or update_pro.py. Standard library only.
"""
import argparse
import datetime as dt
import json
import os
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote, urlsplit
from urllib.request import Request, urlopen
from email.utils import parsedate_to_datetime

ROOT = Path(__file__).resolve().parents[1]
CDN = 'https://ddragon.leagueoflegends.com'
WIKI_API = os.getenv('LEAGUEPEDIA_API', 'https://lol.fandom.com/api.php')
WIKI = os.getenv('LEAGUEPEDIA_WIKI', 'https://lol.fandom.com/wiki/')
AGENT = 'MidLab/2.3 (https://github.com/emabersa27/MidLab; esports data project)'
last_wiki = None


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def norm(value):
    return re.sub('[^a-z0-9]', '', str(value).lower())


def photo_key(value):
    return str(value).strip().lower()


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def delay_seconds(value, default):
    try:
        return max(default, int(value))
    except (TypeError, ValueError):
        try:
            return max(default, (parsedate_to_datetime(value) - dt.datetime.now(dt.timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return default


def request_json(url, params=None, wiki=False):
    global last_wiki
    if params:
        url += ('&' if '?' in url else '?') + urlencode(params)
    for attempt in range(3):
        if wiki and last_wiki is not None:
            wait = 65 - (time.monotonic() - last_wiki)
            if wait > 0:
                print(f'Leaguepedia: pausa di {wait:.0f}s per rispettare il limite.', flush=True)
                time.sleep(wait)
        try:
            if wiki:
                last_wiki = time.monotonic()
            with urlopen(Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/json'}), timeout=35) as response:
                result = json.load(response)
            error = result.get('error') if isinstance(result, dict) else None
            if error:
                if error.get('code') in ('ratelimited', 'maxlag') and attempt < 2:
                    pause = 65 * (2 ** attempt)
                    print(f'Leaguepedia: limite temporaneo, nuovo tentativo tra {pause}s.', flush=True)
                    time.sleep(pause)
                    continue
                raise RuntimeError(f"API: {error.get('code')}: {error.get('info')}")
            return result
        except HTTPError as err:
            if err.code in (429, 503) and attempt < 2:
                pause = delay_seconds(err.headers.get('Retry-After'), (65 if wiki else 5) * 2 ** attempt)
                print(f'HTTP {err.code}: pausa di {pause:.0f}s.', flush=True)
                time.sleep(pause)
                continue
            raise RuntimeError(f'HTTP {err.code} da {urlsplit(url).netloc}') from err
    raise RuntimeError('Numero massimo di tentativi raggiunto')


def chunks(values, size):
    for i in range(0, len(values), size):
        yield values[i:i+size]


def filekey(value):
    return str(value).removeprefix('File:').replace('_', ' ').strip().casefold()


def photos(matches):
    path = ROOT / 'pro-players.json'
    cache = read_json(path, {'players': {}})
    players = cache['players']
    # Player fields come from the verified match records, not arbitrary guesses.
    names = {photo_key(g['player']): g['player'] for g in matches if isinstance(g.get('player'), str) and g['player'].strip()}
    pending = sorted((name for key, name in names.items() if not players.get(key, {}).get('url')), key=str.casefold)
    print(f'Foto: {len(names)} giocatori, {len(pending)} da cercare.', flush=True)
    for batch in chunks(pending, 35):
        # Player and OverviewPage are the case-sensitive page identity, not
        # necessarily the shorter IGN. Do not guess if an exact match fails.
        names_sql = ','.join(json.dumps(x, ensure_ascii=False) for x in batch)
        response = request_json(WIKI_API, dict(action='cargoquery', format='json', tables='Players',
            fields='OverviewPage=player,Image=image', where=f'OverviewPage IN ({names_sql})', limit=100), wiki=True)
        rows = response.get('cargoquery')
        if not isinstance(rows, list):
            raise RuntimeError('Leaguepedia: risposta Cargo inattesa')
        files = {}
        for row in rows:
            obj = row.get('title', {})
            name, image = obj.get('player'), obj.get('image')
            if name and photo_key(name) in names and image:
                image = str(image).strip()
                if image and '|' not in image:
                    files[photo_key(name)] = (name, image if image.startswith('File:') else 'File:' + image)
        if not files:
            print('Nessuna foto associata a questo gruppo; mantengo le iniziali.', flush=True)
            continue
        titles = sorted({v[1] for v in files.values()})
        result = request_json(WIKI_API, dict(action='query', format='json', prop='imageinfo', iiprop='url', iiurlwidth=96,
            redirects=1, titles='|'.join(titles)), wiki=True)
        query = result.get('query', {})
        aliases = {filekey(x['from']): filekey(x['to']) for x in query.get('normalized', []) + query.get('redirects', [])}
        images = {filekey(p.get('title')): p for p in query.get('pages', {}).values() if p.get('imageinfo')}
        for key, (name, title) in files.items():
            k = filekey(title)
            for _ in range(5):
                if k not in aliases or aliases[k] == k:
                    break
                k = aliases[k]
            page = images.get(k, {})
            info = (page.get('imageinfo') or [{}])[0]
            url = info.get('thumburl') or info.get('url')
            if isinstance(url, str) and url.startswith('https://'):
                source = info.get('descriptionurl') or WIKI + quote(page.get('title', title).replace(' ', '_'), safe=':')
                players[key] = {'name': name, 'url': url, 'source': source, 'profile': WIKI + quote(name.replace(' ', '_'), safe='()')}
        atomic_json(path, {'updatedAt': stamp(), 'players': players})
        print(f'Foto salvate: {sum(k in players for k in names)}/{len(names)}', flush=True)
    # Preserve earlier results, even if a player doesn't have a photograph.
    atomic_json(path, {'updatedAt': stamp(), 'players': players})
    print(f'Foto disponibili: {sum(k in players for k in names)}/{len(names)}.', flush=True)


def icons(matches):
    path = ROOT / 'pro-icons.json'
    saved = read_json(path, {'icons': {}})['icons']
    kinds = ('items', 'runes', 'spells')
    maps = {k: saved.get(k, {}) for k in kinds}
    required = {k: {} for k in kinds}

    def need(kind, values):
        for v in values:
            if v and str(v) != '0' and norm(v):
                required[kind][norm(v)] = str(v)

    for g in matches:
        need('items', (g.get('items') or []) + [g.get('trinket')])
        need('spells', g.get('spells') or [])
        r = g.get('runes') or {}
        need('runes', (r.get('primary') or []) + (r.get('secondary') or []))
        need('items', g.get('buildPath') or [])
        for group in g.get('purchaseTimeline') or []:
            need('items', group.get('items') or [])
        for t in g.get('teams') or []:
            for p in t.get('players') or []:
                need('items', p.get('items') or [])

    def missing(kind):
        return set(required[kind]) - set(maps[kind])

    def register(kind, obj, version, image, ident):
        if not image:
            return
        name = obj.get('name', str(ident))
        for value in (ident, name, obj.get('key'), obj.get('id')):
            key = norm(value) if value is not None else ''
            if key in required[kind] and key not in maps[kind]:
                maps[kind][key] = {'name': name, 'url': image, 'version': version}

    def save():
        atomic_json(path, {'updatedAt': stamp(), 'icons': maps})

    print('Icone: ricerca per ID o nome nei cataloghi Riot Data Dragon.', flush=True)
    versions = request_json(CDN + '/api/versions.json')
    # Look at the most recent build of each patch for the years represented in
    # the cache, plus the current patch. Older icons supplement the live UI.
    years = [int(str(g.get('date', ''))[:4]) for g in matches if re.match(r'^20\d\d', str(g.get('date', '')))]
    oldest = max(1, min(years, default=2026) - 2010)
    seen = set()
    candidates = []
    for v in versions:
        parts = str(v).split('.')
        if len(parts) < 3 or not parts[0].isdigit() or int(parts[0]) < oldest:
            continue
        key = '.'.join(parts[:2])
        if key not in seen:
            seen.add(key)
            candidates.append(v)
    if not candidates and versions:
        candidates = [versions[0]]
    for v in candidates:
        if not any(missing(k) for k in kinds):
            break
        print(f'Icone: Data Dragon {v} — {sum(len(missing(k)) for k in kinds)} ancora da trovare.', flush=True)
        base = f'{CDN}/cdn/{v}/data/en_US/'
        for kind, filename in [('items','item.json'), ('runes','runesReforged.json'), ('spells','summoner.json')]:
            if not missing(kind):
                continue
            try:
                data = request_json(base + filename)
                if kind == 'runes':
                    for tree in data:
                        for slot in tree['slots']:
                            for r in slot['runes']:
                                register(kind, r, v, CDN+'/cdn/img/'+r['icon'], r['id'])
                else:
                    entries = data['data'].items()
                    if kind == 'items':
                        entries = sorted(entries, key=lambda x: not x[1].get('maps', {}).get('11', False))
                    for ident, obj in entries:
                        image = obj.get('image', {}).get('full')
                        if image:
                            sub = 'item' if kind == 'items' else 'spell'
                            register(kind, obj, v, f'{CDN}/cdn/{v}/img/{sub}/{image}', ident)
                save()
                time.sleep(.15)
            except (RuntimeError, URLError, ValueError, KeyError) as err:
                print(f'Catalogo {kind} {v}: {err}; proseguo.', flush=True)
    save()
    for kind in kinds:
        remaining = [required[kind][key] for key in sorted(missing(kind))]
        print(f'{kind}: {len(required[kind])-len(remaining)}/{len(required[kind])} icone trovate.', flush=True)
        if remaining:
            print('Non riconosciute: ' + ', '.join(remaining), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--photos-only', action='store_true')
    group.add_argument('--icons-only', action='store_true')
    args = parser.parse_args()
    matches = read_json(ROOT / 'pro-matches.json', {}).get('matches', [])
    if not isinstance(matches, list) or not matches:
        parser.error('pro-matches.json non contiene partite. Nessuna modifica eseguita.')
    print(f'{len(matches)} record esistenti; il database partite non verra modificato.', flush=True)
    failed = False
    for task, enabled in [(icons, not args.photos_only), (photos, not args.icons_only)]:
        if enabled:
            try:
                task(matches)
            except (RuntimeError, URLError, OSError, ValueError, KeyError) as err:
                failed = True
                print(f'{task.__name__}: {err}. Risultati gia salvati conservati.', flush=True)
    print('Fine. Carica su GitHub i file pro-players.json e pro-icons.json se presenti.', flush=True)
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
