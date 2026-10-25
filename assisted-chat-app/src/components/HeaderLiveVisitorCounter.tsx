import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { LiveVisitorCountState } from '@/hooks/useLiveVisitorCount';
import {
  changedVisitorCounts,
  formatLiveVisitorProjectName,
  visitorChangeLabel,
  visitorCountEntries,
  type VisitorCountChange,
  type VisitorCountEntry,
} from '@/lib/live-visitor-notice';
import { USE_NATIVE_DRIVER, useReducedMotion } from './motion';
import { colors, radius } from './theme';

const CHANGE_NOTICE_DURATION_MS = 6_000;

interface VisitorNotice {
  changes: VisitorCountChange[];
  sequence: number;
  contextKey: string;
}

interface VisitorObservation {
  contextKey: string;
  projects: LiveVisitorCountState['projects'];
  liveCount: number | null;
  updatedAt: string | null;
  error: string | null;
  entries: VisitorCountEntry[];
  notice: VisitorNotice | null;
  sequence: number;
}

export function HeaderLiveVisitorCounter({ state }: { state: LiveVisitorCountState }) {
  const [observation, setObservation] = useState<VisitorObservation>(() => ({
    contextKey: state.contextKey,
    projects: state.projects,
    liveCount: state.liveCount,
    updatedAt: state.updatedAt,
    error: state.error,
    entries: state.error ? [] : visitorCountEntries(state.projects, state.liveCount),
    notice: null,
    sequence: 0,
  }));
  const [dismissedSequence, setDismissedSequence] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  // Compare each server snapshot before rendering its notice. Rotation alone
  // does not change the snapshot, and failed requests preserve the baseline.
  if (!state.error && (
    observation.contextKey !== state.contextKey ||
    observation.projects !== state.projects ||
    observation.liveCount !== state.liveCount ||
    observation.updatedAt !== state.updatedAt ||
    observation.error !== state.error
  )) {
    const entries = visitorCountEntries(state.projects, state.liveCount);
    const sameContext = observation.contextKey === state.contextKey;
    const changes = changedVisitorCounts(
      sameContext ? observation.entries : null,
      entries,
    );
    const sequence = observation.sequence + (changes.length > 0 ? 1 : 0);
    setObservation({
      contextKey: state.contextKey,
      projects: state.projects,
      liveCount: state.liveCount,
      updatedAt: state.updatedAt,
      error: state.error,
      entries,
      sequence,
      notice: changes.length > 0
        ? { changes, sequence, contextKey: state.contextKey }
        : sameContext && entries.length > 0 ? observation.notice : null,
    });
  }

  const notice = observation.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setDismissedSequence(notice.sequence), CHANGE_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const visibleNotice = !state.error && state.liveCount !== null && notice?.contextKey === state.contextKey && notice.sequence !== dismissedSequence
    ? notice
    : null;
  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!visibleNotice || reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 230, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(pulse, { toValue: 0, duration: 620, useNativeDriver: USE_NATIVE_DRIVER }),
    ]), { iterations: 3 });
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion, visibleNotice]);

  // Keep a changed site visible long enough to read, even while other sites rotate.
  const singleChange = visibleNotice?.changes.length === 1 ? visibleNotice.changes[0] : null;
  const project = visibleNotice ? singleChange?.project ?? null : state.activeProject;
  const projectName = formatLiveVisitorProjectName(project);
  const displayCount = singleChange ? singleChange.liveCount : project?.liveCount ?? state.liveCount;
  const hasCount = displayCount !== null && !state.error;
  const countLabel = hasCount ? displayCount.toLocaleString('en-GB') : state.loading ? '...' : '--';
  const suffix = hasCount ? `live ${displayCount === 1 ? 'visitor' : 'visitors'}` : state.loading ? 'loading' : 'unavailable';
  const changeLabel = visibleNotice ? visitorChangeLabel(visibleNotice.changes) : '';
  const hasIncrease = Boolean(visibleNotice?.changes.some((change) => change.delta > 0));
  const hasDecrease = Boolean(visibleNotice?.changes.some((change) => change.delta < 0));
  const isDecreaseOnly = hasDecrease && !hasIncrease;
  const description = hasCount
    ? `${projectName} has ${displayCount} live ${displayCount === 1 ? 'visitor' : 'visitors'}`
    : state.loading ? `Loading ${projectName} live visitors` : `${projectName} live visitors unavailable`;
  const changeDescription = visibleNotice?.changes.map((change) =>
    `${formatLiveVisitorProjectName(change.project)} ${change.delta > 0 ? 'increased' : 'decreased'} from ${change.previousCount} to ${change.liveCount}`,
  ).join('. ');

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={changeDescription ? `${description}. Visitor count changed. ${changeDescription}` : description}
      testID="assisted-chat-header-live-visitors"
    >
      <Animated.View style={[
        styles.countRow,
        visibleNotice && (isDecreaseOnly ? styles.decreaseRow : styles.increaseRow),
        { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] },
      ]}>
        <Animated.View pointerEvents="none" style={[
          styles.glow,
          isDecreaseOnly && styles.decreaseGlow,
          { opacity: pulse },
        ]} />
        <View style={[styles.dot, isDecreaseOnly && styles.decreaseDot]} />
        <Text style={styles.label} numberOfLines={2}>
          <Text>{projectName} </Text>
          <Text style={styles.count} testID="assisted-chat-header-live-visitors-count">{countLabel}</Text>
          <Text> {suffix}</Text>
        </Text>
      </Animated.View>
      <Text
        style={[styles.change, isDecreaseOnly ? styles.decreaseText : styles.increaseText]}
        numberOfLines={1}
        testID="assisted-chat-header-live-visitors-change"
      >
        {changeLabel || ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minWidth: 0, maxWidth: '100%', marginTop: 4, alignSelf: 'flex-start' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, paddingHorizontal: 6, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentMuted, overflow: 'hidden' },
  increaseRow: { borderColor: colors.success, backgroundColor: colors.successBg },
  decreaseRow: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  glow: { ...StyleSheet.absoluteFillObject, borderRadius: radius.sm, backgroundColor: 'rgba(53,230,107,0.25)' },
  decreaseGlow: { backgroundColor: 'rgba(79,140,255,0.25)' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, flexShrink: 0 },
  decreaseDot: { backgroundColor: colors.blue },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', minWidth: 0, flexShrink: 1 },
  count: { color: colors.text, fontSize: 14, fontWeight: '900' },
  change: { minHeight: 17, marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: '900', paddingHorizontal: 6 },
  increaseText: { color: colors.success },
  decreaseText: { color: colors.blue },
});
