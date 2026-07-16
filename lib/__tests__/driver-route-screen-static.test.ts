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
    const topOverlay = source.slice(
      source.indexOf('{/* ── Top overlay: compact header'),
      source.indexOf('{/* ── Live instruction card'),
    );

    expect(topOverlay).not.toContain('healthPill');
    expect(source).toContain('styles.instructionStatusPill');
    expect(source).toContain('{routeHealth.label}');
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
