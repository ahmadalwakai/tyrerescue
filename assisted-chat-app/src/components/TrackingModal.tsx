import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { isValidCoordinate, haversineMiles, formatDistanceMiles } from '@/lib/geo';
import { buildTrackingMapHtml, type TrackingMapState } from './tracking/tracking-map-html';
import { CopyAddressButton } from './CopyAddressButton';
import { ModalSafeAreaView } from './layout/ModalSafeAreaView';
import {
  useTracking,
  type TrackingDriver,
  type TrackingJob,
  type TrackingJobsRange,
  type TrackingPaymentSummary,
} from '@/hooks/useTracking';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface WebFrameRef {
  contentWindow?: {
    postMessage: (message: unknown, targetOrigin: string) => void;
  } | null;
}

const trackingPanelShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 -6px 18px rgba(249,115,22,0.12)' }
    : {
        shadowColor: colors.accent,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 4,
      }
) as ViewStyle;

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function formatGbpPence(pence: number): string {
  return GBP.format(pence / 100);
}

function formatRelative(at: string | null): string {
  if (!at) return '—';
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function freshnessLabel(freshness: TrackingDriver['locationFreshness']): string {
  if (freshness === 'live') return 'Live';
  if (freshness === 'stale') return 'Stale signal';
  if (freshness === 'offline') return 'Offline';
  return 'Unknown';
}

function situationLine(situation: TrackingDriver['driverSituation'] | TrackingJob['driverSituation']): string | null {
  if (!situation) return null;
  const reason = situation.reasonLabels[0];
  return reason ? `${situation.label} · ${reason}` : situation.label;
}

function paymentLine(payment: TrackingPaymentSummary | null): string {
  if (!payment) return 'Payment needs checking';
  const amountToCollectPence = payment.amountToCollectPence ?? 0;
  const due =
    amountToCollectPence > 0
      ? formatGbpPence(amountToCollectPence)
      : null;

  if (payment.state === 'paid' && amountToCollectPence === 0) {
    return 'Paid · nothing to collect';
  }
  if (payment.state === 'paid') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.state === 'needs_checking') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.state === 'failed') return due ? `Payment failed · ${due}` : 'Payment failed';
  if (payment.state === 'cash_to_collect' || payment.method === 'cash') return due ? `Cash to collect: ${due}` : 'Cash to collect';
  if (payment.state === 'balance_due' || payment.state === 'deposit_paid') return due ? `Deposit paid · balance due: ${due}` : 'Deposit paid';
  if (payment.state === 'pending') return due ? `Payment pending · ${due}` : 'Payment pending';
  if (due) return `Amount due: ${due}`;
  return payment.label || 'Confirm payment with driver';
}

function needsPaymentWarning(payment: TrackingPaymentSummary | null): boolean {
  if (!payment) return true;
  return !(payment.state === 'paid' && (payment.amountToCollectPence ?? 0) === 0);
}

function initials(name: string | null | undefined, fallback: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? fallback[0] ?? 'T';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}

function callNumber(phone: string | null | undefined) {
  const cleaned = phone?.trim();
  if (!cleaned) return;
  void Linking.openURL(`tel:${cleaned}`).catch(() => undefined);
}

// ─── Map HTML ────────────────────────────────────────────────────────────────

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

const JOB_RANGE_OPTIONS: Array<{ value: TrackingJobsRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: '7 days' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_year', label: 'Last year' },
];

const ASSIGNABLE_JOB_STATUSES = new Set(['awaiting_payment', 'deposit_paid', 'paid']);

interface DriverDetailProps {
  driver: TrackingDriver;
  distanceToJob: string | null;
}

function DriverDetail({ driver, distanceToJob }: DriverDetailProps) {
  const isStale = driver.locationFreshness === 'stale';
  const isOffline = driver.locationFreshness === 'offline';
  return (
    <View style={styles.detailBlock}>
      <View style={styles.cardBadgeTop}>
        <View style={[styles.cardAvatar3d, styles.driverAvatar3d]}>
          <Text style={styles.cardAvatarText}>{initials(driver.name, 'D')}</Text>
        </View>
        <View style={styles.cardBadgeCopy}>
          <Text style={styles.cardKicker}>Driver</Text>
          <Text style={styles.detailTitle} numberOfLines={1}>{driver.name}</Text>
        </View>
      </View>
      <View style={styles.detailPillRow}>
        <View style={[
          styles.freshPill,
          driver.locationFreshness === 'live' && styles.freshPillLive,
          isStale && styles.freshPillStale,
          isOffline && styles.freshPillOffline,
        ]}>
          <Text style={styles.freshPillText}>{freshnessLabel(driver.locationFreshness)}</Text>
        </View>
        <View style={[
          styles.statusPill,
          driver.status === 'available' && styles.statusPillAvailable,
          driver.status === 'busy' && styles.statusPillBusy,
        ]}>
          <Text style={styles.statusPillText}>{driver.status}</Text>
        </View>
      </View>
      {driver.lastSeenAt ? (
        <Text style={[styles.detailMeta, isStale && styles.detailMetaWarn]}>
          Last seen {formatRelative(driver.lastSeenAt)}
        </Text>
      ) : (
        <Text style={styles.detailMeta}>No location data</Text>
      )}
      {driver.activeJobRef ? (
        <Text style={styles.detailMeta}>Active job: #{driver.activeJobRef}</Text>
      ) : null}
      {situationLine(driver.driverSituation) ? (
        <Text style={styles.detailMeta}>Situation: {situationLine(driver.driverSituation)}</Text>
      ) : null}
      {distanceToJob ? (
        <Text style={styles.detailMeta}>Approx. distance to job: {distanceToJob}</Text>
      ) : null}
      {(isStale || isOffline) ? (
        <Text style={styles.detailWarn}>Driver location is not live.</Text>
      ) : null}
    </View>
  );
}

interface JobDetailProps {
  job: TrackingJob;
  distanceFromDriver: string | null;
}

function JobDetail({ job, distanceFromDriver }: JobDetailProps) {
  return (
    <View style={styles.detailBlock}>
      <View style={styles.detailHeaderRow}>
        <View style={styles.cardBadgeTop}>
          <View style={[styles.cardAvatar3d, styles.jobAvatar3d]}>
            <Text style={styles.cardAvatarText}>J</Text>
          </View>
          <View style={styles.cardBadgeCopy}>
            <Text style={styles.cardKicker}>Job</Text>
            <Text style={styles.detailTitle}>#{job.ref}</Text>
          </View>
        </View>
        <View style={[
          styles.assignPill,
          job.assignmentStatus === 'unassigned' && styles.assignPillUnassigned,
        ]}>
          <Text style={styles.assignPillText}>
            {job.assignmentStatus === 'unassigned' ? 'Unassigned' : 'Assigned'}
          </Text>
        </View>
      </View>
      {job.customerName ? (
        <Text style={styles.detailName} numberOfLines={1}>{job.customerName}</Text>
      ) : null}
      <Text style={styles.detailAddress} numberOfLines={2}>{job.address}</Text>
      <CopyAddressButton address={job.address} contextKey={job.id} />
      {job.tyreSummary ? (
        <Text style={styles.detailMeta}>Tyres: {job.tyreSummary}</Text>
      ) : null}
      {job.vehicleSummary ? (
        <Text style={styles.detailMeta}>Vehicle: {job.vehicleSummary}</Text>
      ) : null}
      <Text style={[
        styles.detailPayment,
        needsPaymentWarning(job.paymentSummary) && styles.detailPaymentWarn,
      ]}>
        {paymentLine(job.paymentSummary)}
      </Text>
      {situationLine(job.driverSituation) ? (
        <Text style={styles.detailMeta}>Driver situation: {situationLine(job.driverSituation)}</Text>
      ) : null}
      {distanceFromDriver ? (
        <Text style={styles.detailMeta}>Approx. distance from driver: {distanceFromDriver}</Text>
      ) : null}
    </View>
  );
}

// ─── Driver list sheet ───────────────────────────────────────────────────────

interface DriverListSheetProps {
  visible: boolean;
  drivers: TrackingDriver[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function DriverListSheet({ visible, drivers, selectedId, onSelect, onClose }: DriverListSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Drivers ({drivers.length})</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close driver list"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={drivers}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No driver locations available.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              const isStale = item.locationFreshness === 'stale' || item.locationFreshness === 'offline';
              const hasPhone = Boolean(item.phone?.trim());
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select driver ${item.name}`}
                  style={({ pressed }) => [
                    styles.listItem,
                    isSelected && styles.listItemSelected,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <View style={styles.cardBadge3d}>
                    <View style={styles.cardBadgeTop}>
                      <View style={[styles.cardAvatar3d, styles.driverAvatar3d]}>
                        <Text style={styles.cardAvatarText}>{initials(item.name, 'D')}</Text>
                      </View>
                      <View style={styles.cardBadgeCopy}>
                        <Text style={styles.cardKicker}>Driver</Text>
                        <Text style={styles.listItemName} numberOfLines={1}>{item.name}</Text>
                      </View>
                      <View style={[
                        styles.freshDot,
                        item.locationFreshness === 'live' && styles.freshDotLive,
                        item.locationFreshness === 'stale' && styles.freshDotStale,
                      ]} />
                    </View>
                    <View style={styles.cardMiniRow}>
                      <Text style={[styles.cardMiniPill, item.status === 'available' && styles.cardMiniPillOk]}>
                        {item.status}
                      </Text>
                      <Text style={[styles.cardMiniPill, isStale && styles.cardMiniPillWarn]}>
                        {freshnessLabel(item.locationFreshness)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.listItemMeta, isStale && styles.listItemMetaWarn]}>
                    {item.activeJobRef ? `Active job: #${item.activeJobRef}` : 'No active job'}
                    {item.lastSeenAt ? ` · ${formatRelative(item.lastSeenAt)}` : ' · no GPS'}
                  </Text>
                  {situationLine(item.driverSituation) ? (
                    <Text style={styles.listItemMeta}>Situation: {situationLine(item.driverSituation)}</Text>
                  ) : null}
                  {item.lat == null ? (
                    <Text style={styles.listItemMeta}>Location unavailable</Text>
                  ) : null}
                  <View style={styles.cardToolsRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        callNumber(item.phone);
                      }}
                      disabled={!hasPhone}
                      accessibilityRole="button"
                      accessibilityLabel={`Call driver ${item.name}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        styles.cardToolBtnCall,
                        !hasPhone && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>Call</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onSelect(item.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use driver ${item.name}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        isSelected && styles.cardToolBtnSelected,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>{isSelected ? 'Selected' : 'Select'}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface JobListSheetProps {
  visible: boolean;
  jobs: TrackingJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function JobListSheet({ visible, jobs, selectedId, onSelect, onClose }: JobListSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Jobs ({jobs.length})</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close job list"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={jobs}
            keyExtractor={(j) => j.id}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No unassigned or active jobs.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              const hasPhone = Boolean(item.customerPhone?.trim());
              const paymentNeedsCheck = needsPaymentWarning(item.paymentSummary);
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select job ${item.ref}`}
                  style={({ pressed }) => [
                    styles.listItem,
                    isSelected && styles.listItemSelected,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <View style={styles.cardBadge3d}>
                    <View style={styles.cardBadgeTop}>
                      <View style={[styles.cardAvatar3d, styles.jobAvatar3d]}>
                        <Text style={styles.cardAvatarText}>J</Text>
                      </View>
                      <View style={styles.cardBadgeCopy}>
                        <Text style={styles.cardKicker}>Job</Text>
                        <Text style={styles.listItemName}>#{item.ref}</Text>
                      </View>
                      <Text style={[
                        styles.listItemBadge,
                        item.assignmentStatus === 'unassigned' && styles.listItemBadgeUnassigned,
                      ]}>
                        {item.assignmentStatus === 'unassigned' ? 'Unassigned' : 'Assigned'}
                      </Text>
                    </View>
                    <View style={styles.cardMiniRow}>
                      <Text style={[styles.cardMiniPill, item.assignmentStatus === 'unassigned' && styles.cardMiniPillDanger]}>
                        {item.status.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.cardMiniPill, paymentNeedsCheck ? styles.cardMiniPillWarn : styles.cardMiniPillOk]}>
                        {paymentNeedsCheck ? 'Check payment' : 'Paid'}
                      </Text>
                    </View>
                  </View>
                  {item.customerName ? (
                    <Text style={styles.listItemMeta} numberOfLines={1}>{item.customerName}</Text>
                  ) : null}
                  <Text style={styles.listItemMeta} numberOfLines={1}>{item.address}</Text>
                  <Text style={[
                    styles.listItemMeta,
                    paymentNeedsCheck && styles.listItemMetaWarn,
                  ]}>
                    {paymentLine(item.paymentSummary)}
                  </Text>
                  <View style={styles.cardToolsRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        callNumber(item.customerPhone);
                      }}
                      disabled={!hasPhone}
                      accessibilityRole="button"
                      accessibilityLabel={`Call customer for job ${item.ref}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        styles.cardToolBtnCall,
                        !hasPhone && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>Call customer</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onSelect(item.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use job ${item.ref}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        isSelected && styles.cardToolBtnSelected,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>{isSelected ? 'Selected' : 'Select job'}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Assign confirm sheet ────────────────────────────────────────────────────

interface AssignConfirmSheetProps {
  visible: boolean;
  driver: TrackingDriver | null;
  job: TrackingJob | null;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

function AssignConfirmSheet({ visible, driver, job, loading, error, onConfirm, onClose }: AssignConfirmSheetProps) {
  if (!driver || !job) return null;
  const showPaymentWarning = needsPaymentWarning(job.paymentSummary);
  const isDriverOffline = driver.locationFreshness === 'offline' || driver.locationFreshness === 'stale';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={loading ? undefined : onClose}>
        <Pressable style={styles.confirmSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.confirmTitle}>Confirm assignment</Text>
          <Text style={styles.confirmBody}>
            Assign job <Text style={styles.confirmHighlight}>#{job.ref}</Text> to{' '}
            <Text style={styles.confirmHighlight}>{driver.name}</Text>?
          </Text>

          {isDriverOffline ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>Driver location is not live. Confirm they are available before dispatching.</Text>
            </View>
          ) : null}

          {showPaymentWarning ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>Check payment before dispatch.</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.confirmActions}>
            <Pressable
              onPress={loading ? undefined : onClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Cancel assignment"
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={loading ? undefined : onConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Confirm assignment"
              style={({ pressed }) => [styles.assignConfirmBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={styles.assignConfirmBtnText}>Assign job</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface TrackingControlsSheetProps {
  visible: boolean;
  jobsRange: TrackingJobsRange;
  onChangeRange: (range: TrackingJobsRange) => void;
  driverCount: number;
  jobCount: number;
  driverLocationCount: number;
  jobLocationCount: number;
  loading: boolean;
  lastUpdated: number | null;
  onRefresh: () => void;
  onFitAll: () => void;
  onOpenDrivers: () => void;
  onOpenJobs: () => void;
  onClose: () => void;
}

/** An overlay inside the tracking modal avoids stacking native sheet presentations. */
function TrackingControlsSheet(props: TrackingControlsSheetProps) {
  const insets = useSafeAreaInsets();
  if (!props.visible) return null;
  return (
    <View style={styles.controlsOverlay} accessibilityViewIsModal testID="tracking-controls-sheet">
      <Pressable style={styles.sheetBackdrop} onPress={props.onClose} accessibilityLabel="Dismiss tracking controls">
        <Pressable style={[styles.controlsSheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}
          onPress={(event) => event.stopPropagation()}>
          <View style={styles.controlsHeading}>
            <Text style={styles.controlsTitle} accessibilityRole="header">Tracking controls</Text>
            <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close tracking controls"
              style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}>
              <Text style={styles.headerBtnText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.controlsScroll} contentContainerStyle={styles.controlsContent}>
            <Text style={styles.controlsUpdated}>
              {props.loading ? 'Updating locations…' : props.lastUpdated != null
                ? `Updated ${formatRelative(new Date(props.lastUpdated).toISOString())}` : 'Waiting for tracking data'}
            </Text>
            <View style={styles.controlsActionRow}>
              <Pressable onPress={props.onOpenDrivers} accessibilityRole="button" accessibilityLabel={`Show ${props.driverCount} drivers`}
                style={({ pressed }) => [styles.controlsTile, pressed && styles.btnPressed]}>
                <Text style={styles.controlsTileTitle}>Drivers ({props.driverCount})</Text>
                <Text style={styles.controlsTileHint}>{props.driverLocationCount} with GPS</Text>
              </Pressable>
              <Pressable onPress={props.onOpenJobs} accessibilityRole="button" accessibilityLabel={`Show ${props.jobCount} jobs`}
                style={({ pressed }) => [styles.controlsTile, pressed && styles.btnPressed]}>
                <Text style={styles.controlsTileTitle}>Jobs ({props.jobCount})</Text>
                <Text style={styles.controlsTileHint}>{props.jobLocationCount} on map</Text>
              </Pressable>
            </View>
            <Text style={styles.controlsSectionTitle}>Job dates</Text>
            <View style={styles.rangeOptions}>
              {JOB_RANGE_OPTIONS.map((option) => (
                <Pressable key={option.value} onPress={() => props.onChangeRange(option.value)}
                  accessibilityRole="button" accessibilityLabel={`Show ${option.label} jobs`}
                  accessibilityState={{ selected: props.jobsRange === option.value }}
                  style={({ pressed }) => [styles.rangeChip, props.jobsRange === option.value && styles.rangeChipActive, pressed && styles.btnPressed]}>
                  <Text style={[styles.rangeChipText, props.jobsRange === option.value && styles.rangeChipTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.controlsActionRow}>
              <Pressable onPress={props.onFitAll} accessibilityRole="button" accessibilityLabel="Fit all locations"
                style={({ pressed }) => [styles.controlsAction, pressed && styles.btnPressed]}>
                <Text style={styles.controlsActionText}>Fit all</Text>
              </Pressable>
              <Pressable onPress={props.onRefresh} disabled={props.loading} accessibilityRole="button" accessibilityLabel="Refresh tracking"
                accessibilityState={{ disabled: props.loading }}
                style={({ pressed }) => [styles.controlsAction, props.loading && styles.btnDisabled, pressed && styles.btnPressed]}>
                <Text style={styles.controlsActionText}>{props.loading ? 'Updating…' : 'Refresh'}</Text>
              </Pressable>
            </View>
            <Text style={styles.controlsSectionTitle}>Map key</Text>
            <Text style={styles.controlsHint}>Round markers are drivers. Diamond markers are jobs. Tap a numbered group to see each location.</Text>
            <View style={styles.legendRow}>
              {[
                ['#16A34A', 'Available driver'], ['#F97316', 'Busy driver'], ['#D97706', 'Stale GPS'],
                ['#64748B', 'Offline / unknown'], ['#DC2626', 'Unassigned job'], ['#2563EB', 'Assigned job'],
              ].map(([color, label]) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
}

// ─── Main TrackingModal ──────────────────────────────────────────────────────

export function TrackingModal({ visible, onClose }: Props) {
  const [jobsRange, setJobsRange] = useState<TrackingJobsRange>('today');
  const { data, dataRange, loading, error, lastUpdated, refresh } = useTracking(visible, jobsRange);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [driversOpen, setDriversOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapReloadKey, setMapReloadKey] = useState(0);

  const webRef = useRef<WebView>(null);
  const webFrameRef = useRef<WebFrameRef | null>(null);
  const token = useMemo(() => getMapboxToken(), []);

  useEffect(() => {
    if (!visible) {
      setSelectedDriverId(null);
      setSelectedJobId(null);
      setDriversOpen(false);
      setJobsOpen(false);
      setControlsOpen(false);
      setAssignOpen(false);
      setAssignError(null);
      setMapError(false);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedJobId(null);
    setAssignOpen(false);
    setAssignError(null);
  }, [jobsRange]);

  // Resume poll when app comes to foreground
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [visible, refresh]);

  const selectedDriver = useMemo(
    () => data?.drivers.find((d) => d.id === selectedDriverId) ?? null,
    [data, selectedDriverId],
  );
  const selectedJob = useMemo(
    () => data?.jobs.find((j) => j.id === selectedJobId) ?? null,
    [data, selectedJobId],
  );

  const mapState = useMemo<TrackingMapState>(() => {
    const driverMarkers = (data?.drivers ?? [])
      .filter((d) => isValidCoordinate(d.lat, d.lng))
      .map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        lat: d.lat,
        lng: d.lng,
        status: d.status,
        freshness: d.locationFreshness,
        activeJobRef: d.activeJobRef,
        lastSeenAt: d.lastSeenAt ? formatRelative(d.lastSeenAt) : null,
        selected: d.id === selectedDriverId,
      }));
    const jobMarkers = (data?.jobs ?? [])
      .filter((j) => isValidCoordinate(j.lat, j.lng))
      .map((j) => ({
        id: j.id,
        ref: j.ref,
        status: j.status,
        customerName: j.customerName,
        customerPhone: j.customerPhone,
        address: j.address,
        tyreSummary: j.tyreSummary,
        vehicleSummary: j.vehicleSummary,
        paymentLine: paymentLine(j.paymentSummary),
        paymentNeedsCheck: needsPaymentWarning(j.paymentSummary),
        lat: j.lat,
        lng: j.lng,
        assignmentStatus: j.assignmentStatus,
        selected: j.id === selectedJobId,
      }));
    return {
      drivers: driverMarkers,
      jobs: jobMarkers,
      doFit: true,
      // A pending date request still displays the previous data. Reframe only
      // when the response for the new date range has actually been accepted.
      fitKey: dataRange ?? jobsRange,
    };
  }, [data, dataRange, jobsRange, selectedDriverId, selectedJobId]);

  const html = useMemo(() => (token ? buildTrackingMapHtml(token) : ''), [token]);

  const postMapStateToWebFrame = useCallback(() => {
    webFrameRef.current?.contentWindow?.postMessage(
      { source: 'tyrerescue-tracking-map', type: 'state', state: mapState },
      '*',
    );
  }, [mapState]);

  const postMapStateToNative = useCallback(() => {
    const json = JSON.stringify(JSON.stringify(mapState)).replace(/</g, '\\u003c');
    webRef.current?.injectJavaScript(`window.__applyState && window.__applyState(${json}); true;`);
  }, [mapState]);

  const canAssign =
    selectedDriver != null &&
    selectedJob != null &&
    selectedJob.assignmentStatus === 'unassigned' &&
    ASSIGNABLE_JOB_STATUSES.has(selectedJob.status);

  const distance = useMemo((): string | null => {
    if (!selectedDriver || !selectedJob) return null;
    if (
      !isValidCoordinate(selectedDriver.lat, selectedDriver.lng) ||
      !isValidCoordinate(selectedJob.lat, selectedJob.lng)
    ) {
      return 'Location unavailable';
    }
    const miles = haversineMiles(
      selectedDriver.lat!,
      selectedDriver.lng!,
      selectedJob.lat!,
      selectedJob.lng!,
    );
    return formatDistanceMiles(miles);
  }, [selectedDriver, selectedJob]);

  // Sync marker state to WebView
  useEffect(() => {
    if (!visible || !token) return;
    if (Platform.OS === 'web') {
      postMapStateToWebFrame();
      return;
    }
    postMapStateToNative();
  }, [
    visible,
    token,
    mapState,
    postMapStateToWebFrame,
    postMapStateToNative,
  ]);

  const handleWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type?: string; kind?: string; id?: string; phone?: string };
      if (msg.type === 'ready') {
        setMapError(false);
        if (Platform.OS === 'web') postMapStateToWebFrame();
        else postMapStateToNative();
        return;
      }
      if (msg.type === 'map-error') { setMapError(true); return; }
      if (msg.type === 'call' && msg.phone?.trim()) {
        callNumber(msg.phone);
        return;
      }
      if (msg.type === 'mk' && msg.id) {
        if (msg.kind === 'driver') {
          setSelectedDriverId((prev) => (prev === msg.id ? null : (msg.id ?? null)));
        } else if (msg.kind === 'job') {
          setSelectedJobId((prev) => (prev === msg.id ? null : (msg.id ?? null)));
        }
      }
    } catch {
      /* ignore malformed messages */
    }
  }, [postMapStateToNative, postMapStateToWebFrame]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return;
    }

    const handleIframeMessage = (event: MessageEvent) => {
      if (event.source !== webFrameRef.current?.contentWindow) return;
      const message = event.data as { source?: string; payload?: unknown };
      if (!message || message.source !== 'tyrerescue-tracking-map') return;
      handleWebMessage(JSON.stringify(message.payload ?? {}));
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [handleWebMessage, visible]);

  const handleFitAll = useCallback(() => {
    if (Platform.OS === 'web') {
      webFrameRef.current?.contentWindow?.postMessage(
        { source: 'tyrerescue-tracking-map', type: 'cmd', name: 'fit' },
        '*',
      );
      return;
    }
    webRef.current?.injectJavaScript('window.__fitAll && window.__fitAll(); true;');
  }, []);

  const handleAssign = useCallback(async () => {
    if (!selectedDriver || !selectedJob) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.patch(
        `/api/admin/bookings/${encodeURIComponent(selectedJob.ref)}/assign`,
        { driverId: selectedDriver.id },
      );
      setAssignOpen(false);
      setSelectedDriverId(null);
      setSelectedJobId(null);
      Alert.alert('Job assigned', `#${selectedJob.ref} assigned to ${selectedDriver.name}.`);
      await refresh();
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Could not assign job. Try again.',
      );
    } finally {
      setAssignLoading(false);
    }
  }, [selectedDriver, selectedJob, refresh]);

  const hasPanel = selectedDriver != null || selectedJob != null;
  const showLoadingOverlay = loading && data == null;
  const driverCount = data?.drivers.length ?? 0;
  const jobCount = data?.jobs.length ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => { if (controlsOpen) setControlsOpen(false); else onClose(); }}
    >
      <ModalSafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.content} accessibilityElementsHidden={controlsOpen}
          importantForAccessibility={controlsOpen ? 'no-hide-descendants' : 'auto'}>
        <View style={styles.header} testID="tracking-single-header">
          <View style={styles.headerTitleBlock}>
            <Text style={styles.title} accessibilityRole="header">Tracking hub</Text>
            <Text style={styles.subtitle}>
              {driverCount} drivers · {jobCount} jobs · {JOB_RANGE_OPTIONS.find((option) => option.value === jobsRange)?.label}
            </Text>
          </View>
          <Pressable onPress={() => setControlsOpen(true)} accessibilityRole="button"
            accessibilityLabel="Open tracking controls" accessibilityState={{ expanded: controlsOpen }}
            style={({ pressed }) => [styles.headerBtn, styles.controlsHeaderBtn, pressed && styles.btnPressed]}>
            <Text style={styles.headerBtnText}>Controls</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close tracking"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{data ? 'Could not refresh. Showing last received locations.' : 'Could not load tracking. Please try again.'}</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Map */}
        <View style={styles.mapWrap} testID="tracking-map-area">
          {!token ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>
                The map is unavailable. Open Controls to view drivers and jobs.
              </Text>
            </View>
          ) : Platform.OS === 'web' ? (
            (() => {
              const Iframe = 'iframe' as unknown as React.ComponentType<{
                srcDoc: string;
                style: { width: string; height: string; border: number; background: string };
                sandbox: string;
                referrerPolicy: string;
                title: string;
                ref?: React.Ref<WebFrameRef>;
                onLoad?: () => void;
              }>;
              return (
                <Iframe
                  key={mapReloadKey}
                  ref={webFrameRef}
                  onLoad={postMapStateToWebFrame}
                  srcDoc={html}
                  style={{ width: '100%', height: '100%', border: 0, background: colors.bg }}
                  sandbox="allow-scripts"
                  referrerPolicy="strict-origin-when-cross-origin"
                  title="Driver tracking map"
                />
              );
            })()
          ) : (
            <WebView
              key={mapReloadKey}
              ref={webRef}
              originWhitelist={['*']}
              source={{ html }}
              style={styles.web}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              androidLayerType="hardware"
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              onMessage={(e) => handleWebMessage(e.nativeEvent.data)}
              onLoadEnd={postMapStateToNative}
              onError={() => setMapError(true)}
            />
          )}

          {mapError && token ? (
            <View style={styles.mapFailure}>
              <Text style={styles.mapFailureText}>Map unavailable. Driver and job lists are still available in Controls.</Text>
              <Pressable onPress={() => { setMapError(false); setMapReloadKey((value) => value + 1); }}
                accessibilityRole="button" accessibilityLabel="Reload map" style={styles.headerBtn}>
                <Text style={styles.headerBtnText}>Reload map</Text>
              </Pressable>
            </View>
          ) : null}

          {showLoadingOverlay ? (
            <View style={[styles.mapOverlay, styles.noPointerEvents]}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mapOverlayText}>Loading tracking…</Text>
            </View>
          ) : null}

          {data != null && driverCount === 0 && jobCount === 0 ? (
            <View style={[styles.mapOverlay, styles.noPointerEvents]}>
              <Text style={styles.mapOverlayText}>No driver or job locations</Text>
            </View>
          ) : null}
        </View>

        {/* Detail panel */}
        {hasPanel ? (
          <View style={styles.panel}>
            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.panelScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedDriver ? (
                <DriverDetail driver={selectedDriver} distanceToJob={distance} />
              ) : null}
              {selectedJob ? (
                <JobDetail job={selectedJob} distanceFromDriver={distance} />
              ) : null}
            </ScrollView>
            <View style={styles.panelActions}>
              {selectedDriver?.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${selectedDriver.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver"
                  style={({ pressed }) => [styles.panelBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.panelBtnText}>Call driver</Text>
                </Pressable>
              ) : null}
              {canAssign ? (
                <Pressable
                  onPress={() => { setAssignError(null); setAssignOpen(true); }}
                  accessibilityRole="button"
                  accessibilityLabel="Assign job to driver"
                  style={({ pressed }) => [styles.assignBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.assignBtnText}>
                    Assign {selectedJob?.ref} to {selectedDriver?.name}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { setSelectedDriverId(null); setSelectedJobId(null); }}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
                style={({ pressed }) => [styles.panelBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.panelBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        </View>
        <TrackingControlsSheet
          visible={controlsOpen}
          jobsRange={jobsRange}
          onChangeRange={setJobsRange}
          driverCount={driverCount}
          jobCount={jobCount}
          driverLocationCount={mapState.drivers.length}
          jobLocationCount={mapState.jobs.length}
          loading={loading}
          lastUpdated={lastUpdated}
          onRefresh={() => { void refresh(); }}
          onFitAll={() => { setControlsOpen(false); handleFitAll(); }}
          onOpenDrivers={() => { setControlsOpen(false); setDriversOpen(true); }}
          onOpenJobs={() => { setControlsOpen(false); setJobsOpen(true); }}
          onClose={() => setControlsOpen(false)}
        />
      </ModalSafeAreaView>

      <DriverListSheet
        visible={driversOpen}
        drivers={data?.drivers ?? []}
        selectedId={selectedDriverId}
        onSelect={(id) => { setSelectedDriverId(id); setDriversOpen(false); }}
        onClose={() => setDriversOpen(false)}
      />

      <JobListSheet
        visible={jobsOpen}
        jobs={data?.jobs ?? []}
        selectedId={selectedJobId}
        onSelect={(id) => { setSelectedJobId(id); setJobsOpen(false); }}
        onClose={() => setJobsOpen(false)}
      />

      <AssignConfirmSheet
        visible={assignOpen}
        driver={selectedDriver}
        job={selectedJob}
        loading={assignLoading}
        error={assignError}
        onConfirm={() => { void handleAssign(); }}
        onClose={() => { setAssignOpen(false); setAssignError(null); }}
      />
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  content: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  headerTitleBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: fontSize.xs, fontWeight: '600' },
  headerBtn: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: space.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  controlsHeaderBtn: { backgroundColor: colors.panelSoft, borderColor: colors.accent },
  closeBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  closeBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '900' },
  btnPressed: { opacity: 0.65 },
  btnDisabled: { opacity: 0.45 },
  errorBanner: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  errorBannerText: { flex: 1, color: colors.danger, fontSize: fontSize.sm },
  retryBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBorder,
  },
  retryBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  controlsOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  controlsSheet: { maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 22,
    borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
  controlsHeading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md,
    paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  controlsTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 19, fontWeight: '800' },
  controlsScroll: { flexShrink: 1, minHeight: 0 },
  controlsContent: { padding: space.md, gap: space.md },
  controlsUpdated: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  controlsActionRow: { flexDirection: 'row', gap: space.sm },
  controlsTile: { flex: 1, minWidth: 0, minHeight: 76, justifyContent: 'center', padding: space.md,
    borderRadius: radius.lg, backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.borderStrong },
  controlsTileTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  controlsTileHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  controlsSectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  controlsAction: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent },
  controlsActionText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  controlsHint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  rangeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mapWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  web: { flex: 1, backgroundColor: '#F1F5F9' },
  fallback: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  fallbackText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
  mapFailure: { position: 'absolute', top: space.md, left: space.md, right: space.md, padding: space.md,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, gap: space.sm },
  mapFailureText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  mapOverlay: {
    position: 'absolute',
    bottom: space.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.sm,
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  mapOverlayText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(9,9,11,0.9)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  rangeChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,121,0,0.16)',
  },
  rangeChipText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rangeChipTextActive: {
    color: colors.text,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 0,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: colors.muted, fontSize: 12 },
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.glowBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
    maxHeight: '48%',
    ...trackingPanelShadow,
  },
  panelScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  panelScrollContent: {
    gap: space.sm,
    paddingBottom: space.xs,
  },
  panelActions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glowBorder,
    flexShrink: 0,
  },
  panelBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    alignItems: 'center',
  },
  panelBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  assignBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  assignBtnText: { color: colors.accentText, fontSize: fontSize.sm, fontWeight: '700' },
  detailBlock: {
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    padding: space.md,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 14px rgba(0,0,0,0.24)' } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOpacity: 0.24,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        } as ViewStyle)),
  },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  detailTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  detailName: { color: colors.text, fontSize: fontSize.sm },
  detailAddress: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16 },
  detailMeta: { color: colors.muted, fontSize: fontSize.xs },
  detailMetaWarn: { color: colors.warning },
  detailPayment: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  detailPaymentWarn: { color: colors.warning },
  detailWarn: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  detailPillRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  freshPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  freshPillLive: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' },
  freshPillStale: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  freshPillOffline: { borderColor: colors.borderStrong, backgroundColor: colors.panelSoft },
  freshPillText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  statusPillAvailable: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' },
  statusPillBusy: { borderColor: colors.accent, backgroundColor: 'rgba(255,121,0,0.14)' },
  statusPillText: { color: colors.text, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  assignPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#F97316',
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  assignPillUnassigned: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.12)' },
  assignPillText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  cardBadge3d: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.card,
    padding: space.sm,
    gap: space.xs,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 9px 14px rgba(0,0,0,0.28)' } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 9 },
          elevation: 6,
        } as ViewStyle)),
    transform: [{ perspective: 650 }, { rotateX: '1deg' }],
  },
  cardBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  cardAvatar3d: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 6px 10px rgba(0,0,0,0.28)' } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        } as ViewStyle)),
  },
  driverAvatar3d: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  jobAvatar3d: {
    backgroundColor: '#F97316',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cardAvatarText: {
    color: '#09090B',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  cardBadgeCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardKicker: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardMiniPill: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  cardMiniPillOk: {
    color: '#86EFAC',
    borderColor: 'rgba(34,197,94,0.36)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  cardMiniPillWarn: {
    color: colors.warning,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  cardMiniPillDanger: {
    color: '#FCA5A5',
    borderColor: 'rgba(239,68,68,0.38)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cardToolsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  cardToolBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  cardToolBtnCall: {
    borderColor: colors.glowBorder,
    backgroundColor: 'rgba(255,121,0,0.12)',
  },
  cardToolBtnSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,121,0,0.2)',
  },
  cardToolText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  // Sheets
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.glowBorder,
    maxHeight: '75%',
    paddingBottom: space.lg,
  },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.glowBorder,
    padding: space.lg,
    gap: space.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glowBorder,
  },
  sheetTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  sheetList: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  listItem: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.md,
    gap: space.sm,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 12px rgba(0,0,0,0.18)' } as ViewStyle)
      : ({
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        } as ViewStyle)),
  },
  listItemSelected: { borderColor: colors.accent, backgroundColor: 'rgba(255,121,0,0.12)' },
  listItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listItemName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
  listItemBadge: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#F97316',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#F97316',
    backgroundColor: 'rgba(249,115,22,0.1)',
  },
  listItemBadgeUnassigned: {
    color: '#EF4444',
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  listItemMeta: { color: colors.muted, fontSize: fontSize.xs },
  listItemMetaWarn: { color: colors.warning },
  freshDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.subtle },
  freshDotLive: { backgroundColor: '#22c55e' },
  freshDotStale: { backgroundColor: '#D97706' },
  emptyWrap: { paddingVertical: space.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },
  // Confirm sheet
  confirmTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  confirmBody: { color: colors.text, fontSize: fontSize.md, lineHeight: 22 },
  confirmHighlight: { color: colors.accent, fontWeight: '700' },
  warnBox: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  warnText: { color: colors.warning, fontSize: fontSize.sm },
  errorBox: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  confirmActions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  assignConfirmBtn: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  assignConfirmBtnText: { color: colors.accentText, fontSize: fontSize.md, fontWeight: '700' },
});
