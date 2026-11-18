"""Update MidLab's static match cache. No keys in the browser.
Official match data: Leaguepedia (CC BY-SA 3.0). SoloQ: Riot Match-V5,
only accounts manually verified as active mid pros by the maintainer.
"""
import argparse, datetime as dt, json, os, re, sys, time
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'pro-matches.json'
LEAGUES = ('LCK','LPL','LEC','LCS')
NOW = dt.datetime.now(dt.timezone.utc)
CUTOFF = NOW - dt.timedelta(days=365)

def get(url, params=None, token=None):
    if params: url += '?' + urlencode(params)
    headers = {'User-Agent': 'MidLab/2.0 (https://github.com/emabersa27/MidLab; esports data project)', 'Accept':'application/json'}
    if token: headers['X-Riot-Token'] = token
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=headers), timeout=30) as response:
                return json.load(response)
        except HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(min(120, int(e.headers.get('Retry-After','15')))); continue
            raise RuntimeError(f'HTTP {e.code} from {url.split("?")[0]}') from None

def split(s):
    return [x.strip() for x in re.split(r'[,;]',s or '') if x.strip()]

def integer(v):
    try: return int(v)
    except (ValueError,TypeError): return None

def leaguepedia():
    api = os.getenv('LEAGUEPEDIA_API','https://lol.fandom.com/api.php')
    wiki = os.getenv('LEAGUEPEDIA_WIKI','https://lol.fandom.com/wiki/')
    for league in LEAGUES:
        offset=0
        while True:
            q = dict(action='cargoquery',format='json',tables='ScoreboardGames=SG,ScoreboardPlayers=P,ScoreboardPlayers=E',join_on='SG.GameId=P.GameId,P.GameId=E.GameId',fields='SG.GameId=game,SG.DateTime_UTC=date,SG.Patch=patch,SG._pageName=page,SG.OverviewPage=tournament,P.Link=player,P.Team=team,P.Champion=champion,E.Champion=opponent,E.Link=enemyPlayer,P.Items__full=items,P.Trinket=trinket,P.SummonerSpells__full=spells,P.PrimaryTree=primaryTree,P.SecondaryTree=secondaryTree,P.Runes__full=runes,P.Kills=k,P.Deaths=d,P.Assists=a,P.PlayerWin=win',where=f'P.IngameRole="Mid" AND E.IngameRole="Mid" AND P.Team!=E.Team AND SG.OverviewPage LIKE "{league}/%" AND SG.DateTime_UTC >= "{CUTOFF:%Y-%m-%d}"',order_by='SG.DateTime_UTC DESC,SG.GameId,P.Link',limit=200,offset=offset)
            data=get(api,q)
            if 'error' in data: raise RuntimeError('Leaguepedia: '+str(data['error'].get('info','query failed')))
            rows=data.get('cargoquery')
            if not isinstance(rows,list): raise RuntimeError('Unexpected Leaguepedia response')
            for row in rows:
                p=row['title']; r=split(p.get('runes')); scores=[integer(p.get(k)) for k in ('k','d','a')]
                win=str(p.get('win','')).lower(); date=str(p.get('date','')).replace(' ','T')
                if not p.get('champion') or not p.get('opponent') or not date: continue
                yield dict(id='leaguepedia:'+p['game']+':'+p['player'],type='competitive',league=league,role='MID',date=date.rstrip('Z')+'Z',patch=p.get('patch'),player=p['player'],team=p.get('team'),champion=p['champion'],opponent=p['opponent'],enemyPlayer=p.get('enemyPlayer'),items=split(p.get('items')),trinket=p.get('trinket'),spells=split(p.get('spells')),runes=dict(primaryTree=p.get('primaryTree'),secondaryTree=p.get('secondaryTree'),primary=r[:4],secondary=r[4:6],shards=r[6:9]),win=True if win in ('1','true','yes') else False if win in ('0','false','no') else None,kda='/'.join(map(str,scores)) if None not in scores else None,source=wiki+quote(p['page'].replace(' ','_'),safe='/'),tournament=p.get('tournament'))
            if len(rows)<200: break
            offset+=len(rows);time.sleep(.5)

def soloq_details(info, p, e, timeline):
    """Extract recorded purchases, ability ranks, scoreboard and CS from Match-V5."""
    duration=info.get('gameDuration')
    def cs(x): return x.get('totalMinionsKilled',0)+x.get('neutralMinionsKilled',0)
    teams=[]
    for teamid in (p['teamId'],e['teamId']):
        members=[x for x in info['participants'] if x['teamId']==teamid]
        teams.append(dict(win=members[0].get('win') if members else None,players=[dict(champion=x['championName'],name=x.get('riotIdGameName') or x.get('summonerName'),kda=f"{x['kills']}/{x['deaths']}/{x['assists']}",cs=cs(x),gold=x.get('goldEarned'),items=[x.get(f'item{i}',0) for i in range(6)],focus=x['participantId']==p['participantId']) for x in members]))
    kills=sum(x['kills'] for x in info['participants'] if x['teamId']==p['teamId'])
    out=dict(duration=duration,cs=cs(p),killParticipation=(p['kills']+p['assists'])/kills if kills else None,teams=teams)
    if timeline is None: return out
    pid=p['participantId']; purchases=[]; skills=[]; gold15=None
    for frame in timeline.get('info',{}).get('frames',[]):
        if frame.get('timestamp')==900000:
            f=frame.get('participantFrames',{}); a=f.get(str(pid),{}).get('totalGold');b=f.get(str(e['participantId']),{}).get('totalGold')
            if a is not None and b is not None: gold15=a-b
        for ev in frame.get('events',[]):
            if ev.get('participantId')!=pid: continue
            if ev.get('type')=='ITEM_PURCHASED' and ev.get('itemId'):
                purchases.append((ev['timestamp']//60000,ev['itemId']))
            elif ev.get('type')=='ITEM_UNDO':
                before=ev.get('beforeId')
                for i in range(len(purchases)-1,-1,-1):
                    if purchases[i][1]==before: purchases.pop(i);break
            elif ev.get('type')=='SKILL_LEVEL_UP' and ev.get('levelUpType')=='NORMAL' and ev.get('skillSlot') in (1,2,3,4): skills.append(ev['skillSlot'])
    groups=[]
    for minute,item in purchases:
        if groups and groups[-1]['minute']==minute:groups[-1]['items'].append(item)
        else:groups.append(dict(minute=minute,items=[item]))
    return dict(out,purchaseTimeline=groups,skillOrder=skills,goldDiff15=gold15)

def soloq(existing):
    token=os.getenv('RIOT_API_KEY')
    accounts=json.loads((ROOT/'scripts/pro-accounts.json').read_text())
    if not token or not accounts:
        print('SoloQ skipped: configure approved RIOT_API_KEY and verified accounts.');return
    valid_regions={'americas','europe','asia','sea'}
    for a in accounts:
        if a.get('league') not in LEAGUES or a.get('region') not in valid_regions or not a.get('rosterSource') or not a.get('player') or not a.get('team'): continue
        region=a['region']; base=f'https://{region}.api.riotgames.com'; puuid=a.get('puuid')
        if not puuid:
            name,tag=a['riotId'].rsplit('#',1); puuid=get(base+'/riot/account/v1/accounts/by-riot-id/'+quote(name,safe='')+'/'+quote(tag,safe=''),token=token)['puuid'];time.sleep(1.3)
        ids=get(base+'/lol/match/v5/matches/by-puuid/'+quote(puuid,safe='')+'/ids',{'queue':420,'startTime':int(CUTOFF.timestamp()),'count':30},token);time.sleep(1.3)
        for mid in ids:
            key=f'riot:{mid}:{a["player"]}'
            if key in existing and 'skillOrder' in existing[key]: continue
            info=get(base+'/lol/match/v5/matches/'+quote(mid,safe=''),token=token)['info'];time.sleep(1.3)
            if info.get('queueId')!=420 or info.get('gameDuration',0)<300: continue
            players=info['participants'];p=next((x for x in players if x['puuid']==puuid and x.get('teamPosition')=='MIDDLE'),None)
            if not p: continue
            enemies=[x for x in players if x['teamId']!=p['teamId'] and x.get('teamPosition')=='MIDDLE']
            if len(enemies)!=1: continue
            e=enemies[0]; styles=p.get('perks',{}).get('styles',[]); stat=p.get('perks',{}).get('statPerks',{}); rune=lambda i:[r['perk'] for r in styles[i].get('selections',[])] if len(styles)>i else []
            when=dt.datetime.fromtimestamp(info['gameStartTimestamp']/1000,dt.timezone.utc)
            try:
                timeline=get(base+'/lol/match/v5/matches/'+quote(mid,safe='')+'/timeline',token=token);time.sleep(1.3)
            except RuntimeError as exc:
                print(f'Timeline unavailable for {mid}: {exc}',file=sys.stderr);timeline=None
            details=soloq_details(info,p,e,timeline)
            yield dict(id=key,type='soloq',league=a['league'],role='MID',date=when.isoformat(),patch='.'.join(info['gameVersion'].split('.')[:2]),player=a['player'],team=a['team'],champion=p['championName'],opponent=e['championName'],items=[p.get(f'item{i}',0) for i in range(6)],trinket=p.get('item6'),spells=[p.get('summoner1Id'),p.get('summoner2Id')],runes=dict(primaryTree=styles[0]['style'] if styles else None,secondaryTree=styles[1]['style'] if len(styles)>1 else None,primary=rune(0),secondary=rune(1),shards=[stat.get(k) for k in ('offense','flex','defense') if stat.get(k)]),win=p['win'],kda=f"{p['kills']}/{p['deaths']}/{p['assists']}",source=a.get('matchHistoryUrl') or a['rosterSource'],matchId=mid,rosterSource=a['rosterSource'],**details)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--only',choices=['competitive','soloq','all'],default='all');args=parser.parse_args()
    original=json.loads(CACHE.read_text()); matches={g['id']:g for g in original['matches']}; errors=[]; attempted=False
    for name,fn in [('competitive',lambda:leaguepedia()),('soloq',lambda:soloq(matches))]:
        if args.only not in ('all',name): continue
        if name=='soloq' and (not os.getenv('RIOT_API_KEY') or not json.loads((ROOT/'scripts/pro-accounts.json').read_text())): print('SoloQ non configurata.');continue
        attempted=True
        try:
            count=0
            for game in fn(): matches[game['id']]=game;count+=1
            print(f'{name}: {count} records')
        except Exception as e: errors.append(name);print(f'{name}: {type(e).__name__}: {e}',file=sys.stderr)
    if errors: print('Sources failed: preserving original cache. No update committed.',file=sys.stderr);return 1
    if not attempted: return 0
    out=[]
    for g in matches.values():
        try:
            stamp=dt.datetime.fromisoformat(g['date'].replace('Z','+00:00'))
            if stamp.tzinfo is None: stamp=stamp.replace(tzinfo=dt.timezone.utc)
            if stamp>=CUTOFF: out.append(g)
        except (KeyError,ValueError): continue
    out.sort(key=lambda g:g['date'],reverse=True)
    tmp=CACHE.with_suffix('.tmp');tmp.write_text(json.dumps({'updatedAt':NOW.isoformat(),'matches':out},ensure_ascii=False,indent=2)+'\n',encoding='utf8');tmp.replace(CACHE);return 0
if __name__=='__main__': sys.exit(main())
