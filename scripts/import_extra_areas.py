"""Additional sourced transport/landmark neighborhoods; resume-safe and serial."""
import json, math, sys, time, urllib.request, xml.etree.ElementTree as ET
from import_geography import OUT, CACHE, overpass
sys.stdout.reconfigure(encoding='utf-8')
places=json.loads((OUT/'places.json').read_text(encoding='utf-8'))
areas=[]
for p in places:
 if p['kind']=='airport' and p.get('iata') in ['TRV','COK','CCJ','CNN']:
  areas.append(dict(p,tile='airport-'+p['iata'].lower(),theme='airport'))
for name,district in [('Thrissur Railway Station - West Entry','thrissur'),('Ernakulam Junction','ernakulam'),('Guruvayur','thrissur'),('Thiruvananthapuram Central','thiruvananthapuram')]:
 p=next(p for p in places if p['name']==name and p['kind']=='station' and p['district']==district)
 areas.append(dict(p,tile='station-'+district+('-guruvayur' if name=='Guruvayur' else ''),theme='station'))
# Feature identities are resolved from OSM, not inferred from the marketing name.
q='[out:json][timeout:50];(nwr["name"~"Forum Kochi|Lulu Mall|LuLu Mall|Vyttila Mobility Hub|Jawaharlal Nehru.*Stadium|Kundannoor Junction",i](9.9,76.25,10.05,76.36););out center;'
try:
 raw=overpass(q,'kochi-named-hubs')
 for e in raw['elements']:
  t=e.get('tags',{});c=e.get('center',e);name=t.get('name:en',t.get('name',''))
  if 'lat' not in c or t.get('railway') or t.get('highway')=='bus_stop':continue
  if 'forum' in name.lower() and not t.get('shop')=='mall':continue
  if 'stadium' in name.lower() and t.get('leisure')!='stadium':continue
  slug='forum-kochi' if 'forum' in name.lower() else 'lulu-mall' if 'lulu' in name.lower() else 'vyttila-hub' if 'vyttila' in name.lower() else 'kaloor-stadium' if 'stadium' in name.lower() else 'kundannoor'
  if any(a['tile']==slug for a in areas):continue
  areas.append({'id':'osm-'+str(e['id']),'name':name,'lat':c['lat'],'lon':c['lon'],'district':'ernakulam','kind':'attraction','source':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'tile':slug,'theme':'stadium' if 'stadium' in slug else 'hub' if 'hub' in slug else 'mall'})
except Exception as e:print('Kochi hubs query failed:',e,flush=True)

completed=[]
def osm_api(lon,lat,radius):
 dlat=radius/111320;dlon=dlat/math.cos(math.radians(lat));url=f'https://api.openstreetmap.org/api/0.6/map?bbox={lon-dlon},{lat-dlat},{lon+dlon},{lat+dlat}'
 request=urllib.request.Request(url,headers={'User-Agent':'KeralaOpenWorld local GIS research/0.1'})
 with urllib.request.urlopen(request,timeout=90) as response:root=ET.fromstring(response.read())
 nodes={n.attrib['id']:{'lat':float(n.attrib['lat']),'lon':float(n.attrib['lon'])} for n in root.findall('node')};elements=[]
 for way in root.findall('way'):
  tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
  if not any(k in tags for k in ['highway','building','railway','aeroway','natural','waterway']):continue
  elements.append({'id':int(way.attrib['id']),'type':'way','tags':tags,'geometry':[nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]})
 return {'elements':elements}
for area in areas:
 key=area['tile'];lat,lon=area['lat'],area['lon'];radius=1750 if area['theme']=='airport' else 950
 dlat=radius/111320;dlon=dlat/math.cos(math.radians(lat));bbox=f'{lat-dlat},{lon-dlon},{lat+dlat},{lon+dlon}'
 q=f'[out:json][timeout:65];(way["highway"]["area"!="yes"]({bbox});way["building"]({bbox});way["railway"~"rail|subway|light_rail"]({bbox});way["waterway"]({bbox});way["natural"~"water|coastline"]({bbox});way["aeroway"~"runway|taxiway|terminal|apron"]({bbox}););out geom;'
 try:
  try:raw=overpass(q,'extra-'+key)
  except Exception:
   print(key,'using small OSM API bbox fallback',flush=True);raw=osm_api(lon,lat,min(radius,1200));(CACHE/('extra-'+key+'.json')).write_text(json.dumps(raw),encoding='utf-8')
  features=[]
  terminals=[]
  for e in raw['elements']:
   geom=e.get('geometry',[]);points=[[p['lon'],p['lat']] for p in geom if p and 'lon' in p]
   if len(points)<2:continue
   tags=e.get('tags',{});features.append({'id':e['id'],'type':e['type'],'tags':tags,'points':points})
   if tags.get('aeroway')=='terminal':
    terminals.append((e,points))
  if terminals:
   e,points=max(terminals,key=lambda t:len(t[1]));area['lat']=sum(p[1] for p in points)/len(points);area['lon']=sum(p[0] for p in points)/len(points);area['terminalSource']=f"https://www.openstreetmap.org/{e['type']}/{e['id']}"
  tile={'id':key,'origin':[lon,lat],'radius':radius,'source':'OpenStreetMap contributors','license':'ODbL-1.0','retrieved':time.strftime('%Y-%m-%d'),'features':features}
  (OUT/(key+'.json')).write_text(json.dumps(tile,separators=(',',':')),encoding='utf-8');area['playable']=True;completed.append(area);(OUT/'extra-areas.json').write_text(json.dumps(completed,indent=2),encoding='utf-8');print(key,len(features),'features',flush=True)
 except Exception as e:print(key,'FAILED',e,flush=True)
print('Completed extra areas:',len(completed),flush=True)
