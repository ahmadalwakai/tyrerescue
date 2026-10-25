import type { NavigationMapMode } from '@/lib/navigation/nativeMapModel';

export interface DriverNavigationMapProps {
  driver: [number, number] | null;
  customer: [number, number] | null;
  routes: { geometry: [number, number][] }[];
  selectedIndex: number;
  remainingGeometry: [number, number][] | null;
  travelledGeometry: [number, number][] | null;
  displayHeading: number | null;
  locationFresh: boolean;
  following: boolean;
  followMode: NavigationMapMode;
  mapDepthMode: '2d' | '3d';
  mapStyleMode: 'streets' | 'satellite';
  followZoom: number;
  cameraEpoch: number;
  routeRevision: string;
  bottomPadding: number;
  topPadding: number;
  showAlternatives: boolean;
  reduceMotion: boolean;
  driverLabel: string;
  customerLabel: string;
  onReady: () => void;
  onPan: () => void;
  onSelectAlternative: (index: number) => void;
  onOpenExternal: () => void;
}
