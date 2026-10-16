"""Small-area OSM API XML fallback, retaining original source feature identities."""
import math, urllib.request, xml.etree.ElementTree as ET
def osm_api(lon,lat,radius):
 dlat=radius/111320;dlon=dlat/math.cos(math.radians(lat));url=f'https://api.openstreetmap.org/api/0.6/map?bbox={lon-dlon},{lat-dlat},{lon+dlon},{lat+dlat}'
 request=urllib.request.Request(url,headers={'User-Agent':'KeralaOpenWorld local GIS research/0.1'})
 with urllib.request.urlopen(request,timeout=90) as response:root=ET.fromstring(response.read())
 nodes={n.attrib['id']:{'lat':float(n.attrib['lat']),'lon':float(n.attrib['lon'])} for n in root.findall('node')};elements=[]
 for way in root.findall('way'):
  tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
  if not any(k in tags for k in ['highway','building','railway','aeroway','natural','waterway','leisure','historic','tourism','place']):continue
  elements.append({'id':int(way.attrib['id']),'type':'way','tags':tags,'geometry':[nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]})
 return {'elements':elements}
