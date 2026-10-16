"""Reproducible local OSM extracts (ODbL) + geoBoundaries ADM2 (ODbL).
No Google imagery, tiles, or geometry. Public services are queried at most twice concurrently.
"""
import json, math, pathlib, time, urllib.request, urllib.parse, concurrent.futures

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'data'
CACHE = ROOT / 'data-cache'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(exist_ok=True)
UA = 'KeralaOpenWorld-local-research/0.1 (original educational exploration game)'
SEEDS = [
 ('thiruvananthapuram','Thiruvananthapuram','Thiruvananthapuram','Padmanabhaswamy Temple',8.4828,76.9435,'temple','Urban coast','The capital, temple streets and the southern coast.','Padmanabha'),
 ('kollam','Kollam','Kollam','Kollam Beach',8.8744,76.5863,'beach','Coast & lakes','Fishing harbours, coastal promenades and Ashtamudi waters.','Kollam Beach|Mahatma Gandhi'),
 ('pathanamthitta','Pathanamthitta','Aranmula','Aranmula Parthasarathy Temple',9.3267,76.6834,'temple','River country','Traditional architecture beside the Pamba river.','Parthasarath|Aranmula'),
 ('alappuzha','Alappuzha','Alappuzha','Alappuzha Beach',9.4928,76.3175,'beach','Backwater coast','Canals, coconut groves and the Arabian Sea.','Alappuzha Beach|Alleppey Beach'),
 ('kottayam','Kottayam','Kumarakom','Kumarakom Bird Sanctuary',9.6270,76.4312,'backwater','Backwaters','Vembanad shores, birdlife and village lanes.','Bird Sanctuary'),
 ('idukki','Idukki','Munnar','Munnar Tea Museum',10.0983,77.0522,'tea','Western Ghats','Tea gardens, winding roads and mist in the hills.','Tea Museum'),
 ('ernakulam','Ernakulam','Fort Kochi','Chinese Fishing Nets',9.9675,76.2421,'fishing','Historic coast','Trading streets and the fishing nets of Fort Kochi.','Chinese Fishing|Cheena'),
 ('thrissur','Thrissur','Thrissur','Vadakkunnathan Temple',10.5242,76.2145,'temple','Cultural capital','Thekkinkadu Maidan, temple roofs and Swaraj Round.','Vadakk|Vadakkum'),
 ('palakkad','Palakkad','Palakkad','Palakkad Fort',10.7631,76.6555,'fort','Palakkad Gap','Laterite ramparts, paddy country and mountain horizons.','Palakkad Fort|Tipu'),
 ('malappuram','Malappuram','Malappuram','Kottakkunnu',11.04674015,76.0828945,'park','Hill country','A green hilltop above the streets of Malappuram.','Kottakkunnu|Kottakunnu'),
 ('kozhikode','Kozhikode','Kozhikode','Kozhikode Beach',11.2593,75.7700,'beach','Malabar coast','Sea breezes, markets and the historic Malabar coast.','Kozhikode Beach|Calicut Beach'),
 ('wayanad','Wayanad','Padinjarathara','Banasura Sagar Dam',11.6705,75.9575,'dam','Misty highlands','Mountain roads, forest and the Banasura reservoir.','Banasura'),
 ('kannur','Kannur','Kannur','St. Angelo Fort',11.8541,75.3714,'fort','Northern coast','Red laterite forts, palms and broad sea views.','Angelo|Kannur Fort'),
 ('kasaragod','Kasaragod','Bekal','Bekal Fort',12.3926,75.0342,'fort','Northern coast','Coastal ramparts and coconut-fringed village roads.','Bekal Fort|Bekal Kotta'),
]

def get_json(url, query=None, retries=3):
 for n in range(retries):
  try:
   data = urllib.parse.urlencode({'data':query}).encode() if query else None
   req = urllib.request.Request(url, data=data, headers={'User-Agent':UA})
   with urllib.request.urlopen(req, timeout=110) as response: return json.load(response)
  except Exception as e:
   if n == retries-1: raise
   print('Retry',url.split('/')[2],str(e),flush=True);time.sleep(4*(n+1))

def overpass(query, key):
 path=CACHE / (key+'.json')
 if path.exists():return json.loads(path.read_text(encoding='utf-8'))
 endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']
 for ep in endpoints:
  try:
   result=get_json(ep+'?'+urllib.parse.urlencode({'data':query}),None,1)
   path.write_text(json.dumps(result),encoding='utf-8');return result
  except Exception as e:
   print('Endpoint failed',ep,str(e),flush=True)
   if hasattr(e,'read'):print(e.read().decode('utf-8','replace')[:1500],flush=True)
 raise RuntimeError('All Overpass services failed for '+key)

def boundaries():
 meta=get_json('https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/')
 path=CACHE/'india-districts.json'
 if not path.exists():path.write_text(json.dumps(get_json(meta['simplifiedGeometryGeoJSON'])),encoding='utf-8')
 data=json.loads(path.read_text(encoding='utf-8'))
 wanted={s[0] for s in SEEDS};features=[]
 for f in data['features']:
  name=f['properties']['shapeName'].lower().replace('kasargod','kasaragod').replace('trivandrum','thiruvananthapuram')
  if name in wanted:
   f['properties']['id']=name;features.append(f)
 assert len(features)==14, [(f['properties']) for f in features]
 (OUT/'districts.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')),encoding='utf-8')
 (OUT/'boundary-source.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
 print('District boundaries:',len(features),flush=True)

def import_tile(seed):
 id,name,town,lname,lat,lon,theme,biome,desc,pattern=seed
 dlat=.0117;dlon=dlat/math.cos(math.radians(lat));bbox=f'{lat-dlat},{lon-dlon},{lat+dlat},{lon+dlon}'
 q=f'[out:json][timeout:80];(way["highway"]["area"!="yes"]({bbox});way["building"]({bbox});way["waterway"]({bbox});way["natural"~"water|coastline"]({bbox});way["landuse"~"forest|grass|meadow|farmland"]({bbox});way["leisure"~"park|garden|nature_reserve"]({bbox});way["railway"~"rail|light_rail|subway"]({bbox});nwr["name"~"{pattern}",i]({bbox}););out center geom;'
 raw=overpass(q,'tile-'+id)
 keep=[];candidates=[]
 import re
 for el in raw['elements']:
  tags=el.get('tags',{}); geom=el.get('geometry',[])
  pts=[[round(p['lon'],7),round(p['lat'],7)] for p in geom if p and 'lon' in p]
  if len(pts)>1:keep.append({'id':el['id'],'type':el['type'],'tags':tags,'points':pts})
  if re.search(pattern,tags.get('name:en',tags.get('name','')),re.I):
   c=el.get('center',el)
   if 'lat' not in c and el.get('bounds'):
    b=el['bounds'];c={'lat':(b['minlat']+b['maxlat'])/2,'lon':(b['minlon']+b['maxlon'])/2}
   candidates.append({'id':el['id'],'type':el['type'],'name':tags.get('name:en',tags.get('name')),'lat':c.get('lat'),'lon':c.get('lon'),'tags':tags})
 tile={'id':id,'origin':[lon,lat],'radius':1250,'source':'OpenStreetMap contributors','license':'ODbL-1.0','retrieved':time.strftime('%Y-%m-%d'),'features':keep,'landmarkCandidates':candidates}
 (OUT/(id+'.json')).write_text(json.dumps(tile,separators=(',',':')),encoding='utf-8')
 valid=[c for c in candidates if c['lat'] and c['lon'] and not c['tags'].get('shop') and not c['tags'].get('tourism') in ['guest_house','hotel'] and not c['tags'].get('man_made') and not c['tags'].get('boundary')=='local_authority']
 def rank(c):
  t=c['tags'];relevant=(theme=='temple' and t.get('amenity')=='place_of_worship' and t.get('religion')=='hindu') or (theme=='fort' and bool(t.get('historic'))) or (theme=='beach' and (t.get('natural')=='beach' or t.get('tourism') in ['beach','attraction'])) or (theme=='tea' and t.get('tourism')=='museum') or (theme=='dam' and t.get('waterway')=='dam') or (theme=='park' and (t.get('leisure')=='park' or t.get('tourism')=='theme_park')) or (theme=='fishing' and t.get('tourism')=='attraction') or (theme=='backwater' and t.get('leisure')=='park')
  return (not relevant,(c['lat']-lat)**2+(c['lon']-lon)**2)
 valid.sort(key=rank)
 primary=valid[0] if valid else None
 print(id,len(keep),'features; landmark',str(primary).encode('ascii','replace').decode(),flush=True)
 result={'id':id,'name':name,'town':town,'landmark':lname,'lat':primary['lat'] if primary else lat,'lon':primary['lon'] if primary else lon,'origin':[lon,lat],'theme':theme,'biome':biome,'description':desc,'source':f"https://www.openstreetmap.org/{primary['type']}/{primary['id']}" if primary else 'https://www.keralatourism.org/','verification':'osm-source-and-district-check' if primary else 'approximate-seed-unverified','asset':'original-procedural-exterior','approximation':'Artist interpretation; OSM roads and building footprints retain local coordinates.'}
 if id=='malappuram' and not primary:result.update(lat=11.04674015,lon=76.0828945,source='https://www.openstreetmap.org/way/319063007',verification='osm-source-record-and-district-check')
 if id=='pathanamthitta':result.update(lat=9.328,lon=76.687614,source='https://www.keralatourism.org/temples/pathanamthitta/aranmula-parthasarathy',verification='official-tourism-coordinate-and-district-check')
 return result

def statewide():
 q='[out:json][timeout:100];(node["place"~"city|town|village"](8.1,74.8,12.85,77.5);nwr["railway"="station"]["name"](8.1,74.8,12.85,77.5);way["aeroway"="aerodrome"]["iata"~"TRV|COK|CCJ|CNN"](8.1,74.8,12.85,77.5););out center;'
 raw=overpass(q,'statewide-pois');places=[]
 for e in raw['elements']:
  c=e.get('center',e);t=e.get('tags',{})
  if 'lat' not in c or not t.get('name'):continue
  places.append({'id':str(e['id']),'name':t.get('name:en',t['name']),'localName':t.get('name:ml',''),'lat':c['lat'],'lon':c['lon'],'kind':'airport' if t.get('aeroway') else 'station' if t.get('railway') else t.get('place','town'),'source':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'iata':t.get('iata')})
 (OUT/'places-raw.json').write_text(json.dumps(places,separators=(',',':')),encoding='utf-8')
 print('Statewide POIs:',len(places),flush=True)

if __name__=='__main__':
 boundaries()
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  districts=list(pool.map(import_tile,SEEDS))
 (OUT/'regions.json').write_text(json.dumps(districts,indent=2),encoding='utf-8')
 statewide()
