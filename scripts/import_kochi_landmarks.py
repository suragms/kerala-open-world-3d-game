import json,sys,time
from import_geography import OUT,overpass
from fetch_osm import osm_api
sys.stdout.reconfigure(encoding='utf-8')
q='[out:json][timeout:35];(nwr["name"~"Forum|Kundannoor",i](9.91,76.29,9.97,76.36););out center;'
try:raw=overpass(q,'kochi-forum-kundannoor')
except Exception:
 raw=osm_api(76.319,9.940,1500)
 for e in raw['elements']:
  pts=e['geometry'];e['center']={'lat':sum(p['lat'] for p in pts)/len(pts),'lon':sum(p['lon'] for p in pts)/len(pts)}
raw['elements']=[e for e in raw['elements'] if any(s in e.get('tags',{}).get('name','').lower() for s in ['forum','kundannoor'])]
extras=json.loads((OUT/'extra-areas.json').read_text(encoding='utf-8'))
for e in raw['elements']:print(e['type'],e['id'],e.get('tags'),e.get('center',{'lat':e.get('lat'),'lon':e.get('lon')}),flush=True)
chosen=[]
for e in raw['elements']:
 t=e.get('tags',{});c=e.get('center',e);name=t.get('name:en',t.get('name',''))
 if 'lat' not in c:continue
 if name.lower().strip() in ['forum mall','forum kochi','forum kochi mall','forum','forum thomsun mall'] and (t.get('shop')=='mall' or t.get('building')):chosen.append((e,c,'forum-kochi','mall'))
 if 'kundannoor' in name.lower() and t.get('highway') and t.get('bridge')=='yes':chosen.append((e,c,'kundannoor','junction'))
seen=set()
for e,c,key,theme in chosen:
 if key in seen:continue
 seen.add(key);lat,lon=c['lat'],c['lon'];raw=osm_api(lon,lat,1200);features=[]
 for el in raw['elements']:
  pts=[[p['lon'],p['lat']] for p in el['geometry']]
  if len(pts)>1:features.append({'id':el['id'],'type':el['type'],'tags':el['tags'],'points':pts})
 (OUT/(key+'.json')).write_text(json.dumps({'id':key,'origin':[lon,lat],'radius':1200,'source':'OpenStreetMap contributors','license':'ODbL-1.0','retrieved':time.strftime('%Y-%m-%d'),'features':features},separators=(',',':')),encoding='utf-8')
 p={'id':'osm-'+str(e['id']),'name':e['tags'].get('name:en',e['tags']['name']),'lat':lat,'lon':lon,'district':'ernakulam','kind':'attraction','source':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'tile':key,'theme':theme,'playable':True};extras=[a for a in extras if a['tile']!=key];extras.append(p);print('Imported',key,len(features),flush=True)
# Prefer the mapped bus-terminal relation over a taxi stand.
from import_geography import CACHE
raw=json.loads((CACHE/'kochi-named-hubs.json').read_text(encoding='utf-8'))
e=next(e for e in raw['elements'] if e['id']==17712257);c=e['center'];p=next(a for a in extras if a['tile']=='vyttila-hub');p.update(id='osm-17712257',name='Vyttila Mobility Hub',lat=c['lat'],lon=c['lon'],source='https://www.openstreetmap.org/relation/17712257',kind='bus_stop')
(OUT/'extra-areas.json').write_text(json.dumps(extras,indent=2),encoding='utf-8')
