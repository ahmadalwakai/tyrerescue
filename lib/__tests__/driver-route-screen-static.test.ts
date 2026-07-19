import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeScreenSource = () =>
  readFileSync(join(process.cwd(), 'driver-app/app/(tabs)/jobs/[ref]/route.tsx'), 'utf8');

describe('driver route screen static contract', () => {
  it('uses streets-first navigation with optional satellite and separate terrain depth', () => {
    const source = routeScreenSource();

    expect(source).toContain("const PRIMARY_STYLE = 'mapbox://styles/mapbox/streets-v12'");
    expect(source).toContain("const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'");
    expect(source).toContain("const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('streets')");
    expect(source).toContain("mapStyleMode === 'streets'");
    expect(source).toContain("mapStyleMode === 'satellite'");
    expect(source).toContain('function applyMapStyle');
    expect(source).toContain("map.addSource('mapbox-dem'");
    expect(source).toContain("map.setTerrain({source:'mapbox-dem'");
    expect(source).toContain("id:'driver-3d-buildings'");
    expect(source).toContain("type:'fill-extrusion'");
    expect(source).toContain("'source-layer':'building'");
    expect(source).toContain("text-opacity', 0.98");
    expect(source).toContain("opts.pitch = depthMode === '3d' ? 58 : 0");
  });

  it('has compact active-driving controls for follow, overview, 2D/3D, and mute', () => {
    const source = routeScreenSource();

    expect(source).toContain('const [mapDepthMode, setMapDepthMode] = useState<MapDepthMode>');
    expect(source).toContain('const handleToggleRouteOverview = useCallback');
    expect(source).toContain('const handleToggleMapDepth = useCallback');
    expect(source).toContain('const handleToggleVoice = useCallback');
    expect(source).toContain('onPress={handleRecenter}');
    expect(source).toContain("accessibilityLabel={routeOverviewActive ? 'Exit route overview' : 'Show route overview'}");
    expect(source).toContain("accessibilityLabel={`Switch map to ${mapDepthMode === '3d' ? '2D' : '3D'}`}");
    expect(source).not.toContain('handleCycleFollowMode');
    expect(source).not.toContain('route.mapOrientation');
    expect(source).toContain('mapDepthMode,');
  });

  it('keeps route health secondary inside the maneuver card rather than a top strip', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('styles.topBar');
    expect(source).not.toContain('topTitlePill');
    expect(source).not.toContain('topTitleShimmer');
    expect(source).not.toContain('jobNumberShimmer');
    expect(source).toContain('{ top: Math.max(insets.top + spacing.xs, spacing.md) }');
    expect(source).toContain('styles.instructionStatusPill');
    expect(source).toContain('{routeHealth.label}');
  });

  it('drives marker and camera from one display navigation state', () => {
    const source = routeScreenSource();

    expect(source).toContain('const displayNavigationState = useMemo');
    expect(source).toContain('displayLocation: displayNavigationState.displayLocation');
    expect(source).toContain('displayHeading: displayNavigationState.displayHeading');
    expect(source).toContain('locationTimestamp: displayNavigationState.locationTimestamp');
    expect(source).toContain('followZoom: displayNavigationState.followZoom');
    expect(source).toContain('var displayLocation = s.displayLocation || s.driver');
    expect(source).toContain('var displayHeading = (s.displayHeading == null ? s.heading : s.displayHeading)');
    expect(source).toContain('center: displayLocation');
    expect(source).toContain('animateDriver(displayLocation, displayHeading');
    expect(source).toContain('maxDisplaySnapDistanceMeters: GPS_DRIFT_METERS');
  });

  it('keeps the driver marker visually centered on its Mapbox anchor', () => {
    const source = routeScreenSource();

    expect(source).toContain('const DRIVER_MARKER_HEADING_OFFSET_DEG = 0');
    expect(source).toContain("const NAV_ROUTE_BLUE = '#1A73E8'");
    expect(source).toContain('var displayRot = rot == null ? null : rot + DRIVER_MARKER_HEADING_OFFSET_DEG');
    expect(source).toContain(".dwrap{width:68px;height:68px;");
    expect(source).toContain(
      ".driver-icon{position:absolute;left:0;top:0;width:68px;height:68px;transform:none",
    );
    expect(source).toContain("fill=\"'+NAV_ROUTE_BLUE+'\"");
    expect(source).toContain("anchor:'center'");
    expect(source).toContain("pitchAlignment:'viewport'");
    expect(source).not.toContain('transform="rotate(45 28 28)"');
  });

  it('separates follow zoom from route overview framing', () => {
    const source = routeScreenSource();

    expect(source).toContain('const FOLLOW_ZOOM_URBAN_MIN = 17.05');
    expect(source).toContain('const FOLLOW_ZOOM_NEAR_MANEUVER = 18.05');
    expect(source).toContain('const OVERVIEW_MAX_ZOOM = 15.6');
    expect(source).toContain('function navigationFollowZoom');
    expect(source).toContain('maxZoom:OVERVIEW_MAX_ZOOM');
    expect(source).toContain("cameraMode==='overview' || mode==='overview'");
    expect(source).toContain('var targetZoom = clampFollowZoom(s.followZoom, depthMode)');
    expect(source).toContain('currentZoom < minSafeZoom');
    expect(source).toContain('nearManeuverZoom && targetZoom > currentZoom + 0.05');
    expect(source).toContain('shortestRot(map.getBearing(), targetBearing)');
  });

  it('limits maneuver shimmer to clipped signal segments inside the turn icon', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('instructionIconShimmer');
    expect(source).toContain('styles.maneuverSignSignalClip');
    expect(source).toContain('styles.maneuverSignSignalSegment');
    expect(source).toContain('styles.maneuverSignArrivalPulse');
    expect(source).toContain("Platform.OS !== 'web' && !maneuverShimmerSpec.paused");
    expect(source).toContain('overflow: \'hidden\'');
  });

  it('restyles existing Mapbox road layers for navigation legibility', () => {
    const source = routeScreenSource();

    expect(source).toContain('function isRoadGeometryLayer');
    expect(source).toContain('function isMinorRoadLayer');
    expect(source).toContain('function isServiceRoadLayer');
    expect(source).toContain('function isSlipRoadLayer');
    expect(source).toContain('function isRoadLabelLayer');
    expect(source).toContain('function isPoiLayer');
    expect(source).toContain("text-opacity', 0.98");
    expect(source).toContain("icon-opacity', 0.18");
    expect(source).toContain('promoteRouteLayers()');
  });

  it('renders a structured roundabout diagram instead of accepting a generic icon only', () => {
    const source = routeScreenSource();

    expect(source).toContain('type RoundaboutDiagramBranch');
    expect(source).toContain('function roundaboutDiagramBranches');
    expect(source).toContain('candidate.bearings.length > 0 && candidate.outIndex != null');
    expect(source).toContain('styles.roundaboutCircle');
    expect(source).toContain('styles.roundaboutBranch');
    expect(source).toContain('styles.roundaboutApproachBranch');
    expect(source).toContain('styles.roundaboutExitBranch');
    expect(source).toContain('styles.roundaboutExitBadge');
    expect(source).toContain("upcomingStep.drivingSide === 'left' ? 'clockwise' : 'anticlockwise'");
    expect(source).toContain('{renderRoundaboutDiagram()}');
  });

  it('locks lane guidance to physical left-to-right order even in RTL locales', () => {
    const source = routeScreenSource();
    const laneStyle = source.slice(
      source.indexOf('laneGuidanceRow: {'),
      source.indexOf('laneCell: {'),
    );

    expect(source).toContain('laneGuidance.lanes.map((lane, index)');
    expect(laneStyle).toContain("flexDirection: 'row'");
    expect(laneStyle).not.toContain('row-reverse');
  });

  it('keeps the collapsed cockpit limited to route metrics and the expand control', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('collapsedHeadline');
    expect(source).not.toContain('collapsedNavIcon');
    expect(source).not.toContain('collapsedPayLabel');
    expect(source).not.toContain('handleCollapsedPrimary');
    expect(source).not.toContain('collapsedInstRow');
    expect(source).not.toContain('collapsedPrimaryBtn');
    expect(source).not.toContain('collapsedActionRow');
    expect(source).toContain('arrivalEtaLabel');
    expect(source).toContain('<Text style={styles.collapsedMetricLabel}>ETA</Text>');
  });

  it('uses navigation progress as the sole passed-route overlay source', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('ROUTE_PROJECTION_MAX_M');
    expect(source).not.toContain('function projectPointOnRoute');
    expect(source).not.toContain('passedRouteCoords');
    expect(source).toContain('travelledGeometry');
    expect(source).toContain('remainingGeometry');
    expect(source).toContain('syncDynamicRouteOverlays(activeRoute, lastDriver, lastCustomer, s.travelledGeometry, s.remainingGeometry)');
  });

  it('does not visually extend the active route to the displayed driver pin', () => {
    const source = routeScreenSource();
    const dynamicOverlayBlock = source.slice(
      source.indexOf('function syncDynamicRouteOverlays'),
      source.indexOf('// Shortest signed angular path'),
    );

    expect(source).not.toContain('function visualRouteCoords');
    expect(source).not.toContain('out.unshift(driver)');
    expect(dynamicOverlayBlock).toContain('var upcomingRaw = (remaining && remaining.length >= 2) ? remaining : route.coords');
    expect(dynamicOverlayBlock).toContain("map.getSource('rsel').setData(featureCollection([lineFeature(upcomingRaw)]))");
  });

  it('preserves the React route payload instead of bridging it to the driver pin', () => {
    const source = routeScreenSource();

    expect(source).toContain("const ROUTE_VISUAL_VERSION = 'authoritative-live-route-v6'");
    expect(source).not.toContain('function bridgeRouteCoordinatesToDriver');
    expect(source).not.toContain('function routeConnectorCoordinates');
    expect(source).not.toContain('[driver, ...coords]');
    expect(source).not.toContain('[driver, coords[0]]');
    expect(source).not.toContain('const routeConnector =');
    expect(source).toContain('const remainingGeometry = routeCanRender');
    expect(source).toContain('navigationProgress.remainingGeometry ?? selectedRouteCoordinates');
    expect(source).toContain('remainingGeometry,');
    expect(source).toContain('coords: r.geometry');
  });

  it('does not anchor the localhost web driver marker to the selected route start', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('const routeStartPosition = useMemo');
    expect(source).not.toContain('const anchorDriverToRouteStart =');
    expect(source).not.toContain('const visualDriverPosition = anchorDriverToRouteStart');
    expect(source).not.toContain('? routeStartPosition');
    expect(source).not.toContain('forceSnap: anchorDriverToRouteStart || navigationProgress.forceSnap');
    expect(source).toContain('forceSnap: displayNavigationState.forceSnap');
    expect(source).toContain('forceSnap: navigationProgress.forceSnap');
  });

  it('shows Google-style route alternatives in overview without a connector layer', () => {
    const source = routeScreenSource();

    expect(source).not.toContain("addSourceIfMissing('rconn'");
    expect(source).not.toContain("id:'r-connector-case'");
    expect(source).not.toContain("id:'r-connector-main'");
    expect(source).not.toContain("s.routeConnector");
    expect(source).toContain("id:'alt-case'");
    expect(source).toContain("line-color':'#4C63FF'");
    expect(source).toContain("setVis('alt-case', s.showAlts)");
    expect(source).toContain("(Platform.OS === 'web' && __DEV__) ||");
    expect(source).toContain("followMode === 'overview'");
  });

  it('validates last-known GPS through the shared accepted-fix path before routing', () => {
    const source = routeScreenSource();
    const lastKnownBlock = source.slice(
      source.indexOf('const last = await Location.getLastKnownPositionAsync'),
      source.indexOf('sub = await Location.watchPositionAsync'),
    );

    expect(source).toContain('const acceptDriverFix = useCallback');
    expect(lastKnownBlock).toContain('const accepted = acceptDriverFix({');
    expect(lastKnownBlock).toContain("source: 'last-known'");
    expect(lastKnownBlock).toContain("accepted?.quality === 'accepted'");
    expect(lastKnownBlock.indexOf('acceptDriverFix({')).toBeLessThan(
      lastKnownBlock.indexOf('handlersRef.current.onFix(accepted.coordinate)'),
    );
  });

  it('models unresolved GPS states explicitly instead of collapsing to blank route UI', () => {
    const source = routeScreenSource();

    expect(source).toContain('type NavigationLocationState =');
    expect(source).toContain("'requesting'");
    expect(source).toContain("'permission-denied'");
    expect(source).toContain("'unavailable'");
    expect(source).toContain("'weak'");
    expect(source).toContain("'accepted'");
    expect(source).toContain("'stale'");
    expect(source).toContain("'error'");
    expect(source).toContain("useState<NavigationLocationState>('requesting')");
    expect(source).toContain("setNavigationLocationState('permission-denied')");
    expect(source).toContain("setNavigationLocationState('unavailable')");
    expect(source).toContain("setNavigationLocationState('error')");
    expect(source).toContain("setNavigationLocationState('stale')");
  });

  it('allows a provisional weak puck while blocking provisional route origins', () => {
    const source = routeScreenSource();

    expect(source).toContain('const PROVISIONAL_ACCURACY_METERS = 100');
    expect(source).toContain('type DriverFixQuality =');
    expect(source).toContain('const quality: DriverFixQuality =');
    expect(source).toContain('accuracyMeters <= ROUTE_ORIGIN_MAX_RAW_ACCURACY_M');
    expect(source).toContain("quality === 'provisional' && !provisionalAccuracyAllowed");
    expect(source).toContain("quality === 'accepted' ? 'gps-fix-accepted' : 'gps-fix-provisional'");
    expect(source).toContain("accepted?.quality === 'accepted'");
    expect(source).toContain('handlersRef.current.onFix(accepted.coordinate)');
    expect(source).toContain("fix.quality !== 'accepted'");
    expect(source).toContain("reason: 'provisional'");
  });

  it('logs foreground location diagnosis without aborting route fetches from watcher cleanup', () => {
    const source = routeScreenSource();
    const watcherBlock = source.slice(
      source.indexOf('// ── Foreground GPS watcher'),
      source.indexOf('// Route signature: changes ONLY'),
    );

    expect(watcherBlock).toContain("logRouteDiagnostic('gps-watch-start'");
    expect(watcherBlock).toContain("logRouteDiagnostic('gps-permission-state'");
    expect(watcherBlock).toContain("logRouteDiagnostic('gps-watch-fix-received'");
    expect(watcherBlock).toContain("logRouteDiagnostic('gps-watch-error'");
    expect(watcherBlock).toContain("logRouteDiagnostic('gps-watch-stop'");
    expect(watcherBlock).not.toContain('routeAbortRef.current?.abort()');
  });

  it('keeps the maneuver card visible for permission, weak GPS, and calculating states', () => {
    const source = routeScreenSource();

    expect(source).toContain('const locationStatusInstruction =');
    expect(source).toContain("t('route.findingLocation')");
    expect(source).toContain("t('route.locationStale')");
    expect(source).toContain("t('route.locationUnavailable')");
    expect(source).toContain('const showInstructionCard =');
    expect(source).toContain('locationStatusInstruction != null');
    expect(source).toContain('routeState.loading ||');
    expect(source).toContain('{showInstructionCard && (');
    expect(source).not.toContain('!permissionDenied && primaryInstruction.length > 0 && (arrival');
  });

  it('uses a conservative destination-area camera only when no driver fix exists', () => {
    const source = routeScreenSource();

    expect(source).toContain('const fallbackCamera =');
    expect(source).toContain('displayNavigationState.displayLocation == null && customer');
    expect(source).toContain('fallbackCamera,');
    expect(source).toContain('fallbackZoom: 11.4');
    expect(source).toContain('s.fallbackCamera');
    expect(source).toContain('map.easeTo({');
    expect(source).toContain('center: s.fallbackCamera');
  });

  it('hydrates a visible route and puck from structured tracking fallback data', () => {
    const source = routeScreenSource();

    expect(source).toContain("type DriverFixSource = 'last-known' | 'watch' | 'dev-simulator' | 'tracking-fallback'");
    expect(source).toContain('type TrackingRouteFallback =');
    expect(source).toContain('function makeTrackingFallbackRoute');
    expect(source).toContain('driverApi.getTrackingData(');
    expect(source).toContain('const [trackingCustomerCoord, setTrackingCustomerCoord]');
    expect(source).toContain('return trackingCustomerCoord');
    expect(source).toContain('const trackingDestination =');
    expect(source).toContain("reason: 'missing-customer-location'");
    expect(source).toContain('setTrackingCustomerCoord((prev)');
    expect(source).toContain('const trackingTimestampMs = parseTrackingTimestamp(tracking.driverLocationAt)');
    expect(source).toContain('const displayTimestampMs = Date.now()');
    expect(source).toContain('timestampMs: displayTimestampMs');
    expect(source).toContain('routeOriginFixAt: trackingTimestampMs ?? displayTimestampMs');
    expect(source).toContain("source: 'tracking-fallback'");
    expect(source).toContain("quality: 'provisional'");
    expect(source).toContain("makeRouteState('mapbox', [route], 0, null");
    expect(source).toContain("logRouteDiagnostic('tracking-fallback-route-applied'");
    expect(source).toContain('const showPermissionOverlay =');
    expect(source).toContain('permissionDenied && !routeIsCurrent && driverLoc == null');
    expect(source).toContain('{mapLoaded && !mapFatal && showPermissionOverlay && (');
  });

  it('keeps route-origin accuracy strict on every platform', () => {
    const source = routeScreenSource();

    expect(source).toContain('const ROUTE_ORIGIN_MAX_RAW_ACCURACY_M = POOR_ACCURACY_METERS');
    expect(source).toContain('accuracyMeters > ROUTE_ORIGIN_MAX_RAW_ACCURACY_M');
    expect(source).not.toContain('2_000 : POOR_ACCURACY_METERS');
  });

  it('requests routes from the latest accepted raw GPS fix only', () => {
    const source = routeScreenSource();
    const originBlock = source.slice(
      source.indexOf('const makeRerouteOrigin = useCallback'),
      source.indexOf('// ── Route request'),
    );

    expect(originBlock).toContain('const fix = driverFixRef.current');
    expect(originBlock).toContain("fix.quality !== 'accepted'");
    expect(originBlock).toContain("source: 'raw'");
    expect(originBlock).toContain('locationTimestamp: timestamp');
    expect(originBlock).toContain('reason: \'stale\'');
    expect(originBlock).toContain('reason: \'accuracy\'');
    expect(originBlock).toContain("reason: 'provisional'");
    expect(originBlock).not.toContain('const coordinate = fix?.coordinate ?? driver');
    expect(originBlock).not.toContain('matchedLocation');
    expect(originBlock).not.toContain('displayLocation');
  });

  it('suspends live maneuvers when route progress is stale, weak, or off-route', () => {
    const source = routeScreenSource();
    const maneuverGateBlock = source.slice(
      source.indexOf('const maneuverLocationTrusted ='),
      source.indexOf('const primaryInstruction ='),
    );

    expect(maneuverGateBlock).toContain('!navigationProgress.isOffRoute');
    expect(maneuverGateBlock).toContain('!navigationProgress.locationWeak');
    expect(maneuverGateBlock).toContain('!navigationProgress.isLocationStale');
    expect(maneuverGateBlock).toContain("routeDeviation?.kind !== 'off-route'");
    expect(maneuverGateBlock).toContain('distanceFromRouteMeters == null || distanceFromRouteMeters <= OFF_ROUTE_METERS');
    expect(maneuverGateBlock).toContain('maneuverLocationTrusted');
  });

  it('keeps production accuracy and unavailable speed-limit placeholders out of active navigation', () => {
    const source = routeScreenSource();

    expect(source).toContain('showAccuracyOverlay: false');
    expect(source).toContain('!!s.showAccuracyOverlay && NAV_DEV');
    expect(source).not.toContain('const speedLimitValueText');
    expect(source).toContain('{speedLimitReliable && (');
    expect(source).toContain("const speedValueText = speedMph != null ? String(speedMph) : '--'");
  });
});
