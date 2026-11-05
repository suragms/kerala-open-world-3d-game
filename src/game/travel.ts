import type { Geography, Place, Region, Snapshot } from '../types';
import { haversine } from '../data/geography';

export const destinationCategories = ['all', 'city', 'village', 'landmark', 'bus_station', 'station', 'airport'] as const;
export type DestinationCategory = typeof destinationCategories[number];
export const categoryLabels: Record<DestinationCategory,string> = {all:'All places',city:'Cities & towns',village:'Villages',landmark:'Landmarks',bus_station:'Bus stands',station:'Railway stations',airport:'Airports'};
export function destinationCategory(place: Place): DestinationCategory {
  if (['city','town','municipality'].includes(place.kind)) return 'city';
  if (['village','hamlet','suburb','neighbourhood'].includes(place.kind)) return 'village';
  if (['bus_station','bus_stop'].includes(place.kind)) return 'bus_station';
  if (place.kind === 'station' || place.kind === 'airport') return place.kind;
  return 'landmark';
}
export function destinationPlaces(geography: Geography): Place[] {
  return [...geography.regions.map(r=>({id:`landmark-${r.id}`,name:r.landmark,district:r.id,lat:r.lat,lon:r.lon,kind:'landmark',source:r.source})),...geography.places];
}
export function travelCapabilities(place: Place, region: Region, current?: {region: Region; area: string; snapshot?: Snapshot; reachable?: boolean}) {
  const covered = !!place.tile || haversine([place.lon,place.lat],region.origin)<1100;
  const local = !!current && (!place.tile || place.tile===current.area) && current.region.id===region.id && haversine([place.lon,place.lat],current.region.origin)<1100;
  const locked = !!(current?.snapshot?.bus?.attached || current?.snapshot?.rail?.attached || current?.snapshot?.taxi?.attached);
  return {covered,local,locked,quickTravel:covered&&!locked, gps:local&&!locked&&current?.reachable!==false,
    taxi:local&&!locked&&!current?.snapshot?.driving&&current?.reachable===true,
    reason:locked?'Exit your transport safely before changing destination.':!covered?'This place is on the map, but its playable area is not available yet.':local&&current?.reachable===false?'No connected local road route. Quick travel is available.':''};
}
