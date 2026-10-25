import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeScreenSource = () =>
  readFileSync(join(process.cwd(), 'driver-app/app/(tabs)/jobs/[ref]/route.tsx'), 'utf8');

describe('driver route screen safety contract', () => {
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

  it('limits maneuver shimmer to clipped signal segments inside the turn icon', () => {
    const source = routeScreenSource();

    expect(source).not.toContain('instructionIconShimmer');
    expect(source).toContain('styles.maneuverSignSignalClip');
    expect(source).toContain('styles.maneuverSignSignalSegment');
    expect(source).toContain('styles.maneuverSignArrivalPulse');
    expect(source).toContain("Platform.OS !== 'web' && !maneuverShimmerSpec.paused");
    expect(source).toContain('overflow: \'hidden\'');
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

  it('uses native maps with no executable browser map or rendering-token gate', () => {
    const source = routeScreenSource();
    const native = readFileSync(join(process.cwd(), 'driver-app/src/components/navigation/DriverNavigationMap.tsx'), 'utf8');
    expect(source).toContain('<DriverNavigationMap');
    expect(native).toContain("from 'react-native-maps'");
    expect(source).not.toContain('buildHtml');
    expect(source).not.toContain('<WebView');
    expect(source).not.toContain('<iframe');
    expect(source).not.toContain('injectJavaScript');
    const watcher = source.slice(source.indexOf('// ── Foreground GPS watcher'), source.indexOf('// Route signature:'));
    expect(watcher).not.toContain('if (!token)');
    expect(native).toContain('locationFresh');
  });

  it('keeps manual job actions, payment, calling, and exit reachable without expanding navigation', () => {
    const source = routeScreenSource();
    const collapsed = source.slice(source.indexOf('{cockpitCollapsed ? ('), source.indexOf('EXPANDED: job details'));
    expect(collapsed).toContain('<DriverPaymentCard');
    expect(collapsed).toContain('handleStatusAction(statusAction.next)');
    expect(collapsed).toContain('handleCallCustomer');
    expect(collapsed).toContain('router.back()');
    expect(source).toContain('showPreJobChecklist');
    expect(source).toContain('showCompletionChecklist');
    expect(source).not.toContain("t('route.depositReceived')");
    expect(source).toContain("getDriverPaymentDisplay(job.paymentSummary ?? job.payment ?? null).tone === 'paid'");
  });
});
