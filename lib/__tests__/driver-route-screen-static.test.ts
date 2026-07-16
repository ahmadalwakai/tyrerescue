import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeScreenSource = () =>
  readFileSync(join(process.cwd(), 'driver-app/app/(tabs)/jobs/[ref]/route.tsx'), 'utf8');

describe('driver route screen static contract', () => {
  it('uses an aerial 3D Mapbox presentation with terrain and building sources', () => {
    const source = routeScreenSource();

    expect(source).toContain("const PRIMARY_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12'");
    expect(source).toContain("map.addSource('mapbox-dem'");
    expect(source).toContain("map.setTerrain({source:'mapbox-dem'");
    expect(source).toContain("id:'driver-3d-buildings'");
    expect(source).toContain("type:'fill-extrusion'");
    expect(source).toContain("'source-layer':'building'");
    expect(source).toContain("text-opacity', 0.98");
    expect(source).toContain("opts.pitch = depthMode === '3d' ? 58 : 0");
  });

  it('has separate orientation, route overview, and 2D/3D depth controls', () => {
    const source = routeScreenSource();

    expect(source).toContain('const [mapDepthMode, setMapDepthMode] = useState<MapDepthMode>');
    expect(source).toContain('const handleToggleRouteOverview = useCallback');
    expect(source).toContain('const handleToggleMapDepth = useCallback');
    expect(source).toContain("accessibilityLabel={routeOverviewActive ? 'Exit route overview' : 'Show route overview'}");
    expect(source).toContain("accessibilityLabel={`Switch map to ${mapDepthMode === '3d' ? '2D' : '3D'}`}");
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
    expect(source).toContain('var displayRot = rot == null ? null : rot + DRIVER_MARKER_HEADING_OFFSET_DEG');
    expect(source).toContain(".dwrap{width:56px;height:56px;");
    expect(source).toContain(
      ".driver-icon{position:absolute;left:0;top:0;width:56px;height:56px;transform:none",
    );
    expect(source).toContain("anchor:'center'");
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

  it('restyles existing Mapbox road layers for satellite navigation legibility', () => {
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

    expect(source).toContain('laneGuidance.lanes.map');
    expect(laneStyle).toContain("flexDirection: 'row'");
    expect(laneStyle).toContain("direction: 'ltr'");
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
  });
});
