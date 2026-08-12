import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { ApiError, driverApi, type DriverProfile, type JobDetail } from '@/api/client';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useI18n } from '@/i18n';
import { successHaptic, errorHaptic } from '@/services/haptics';

type GpsState = {
  lat: number;
  lng: number;
  accuracy: number | null;
} | null;

const signatureHtml = `
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    canvas{display:block;width:100%;height:100%;background:#fff;touch-action:none}
    .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:18px;font-weight:700;pointer-events:none}
  </style>
</head>
<body>
  <canvas id="pad"></canvas>
  <div class="hint" id="hint">Sign Here</div>
  <script>
    const canvas = document.getElementById('pad');
    const ctx = canvas.getContext('2d');
    const hint = document.getElementById('hint');
    let drawing = false;
    let pointCount = 0;
    let last = null;

    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = canvas.toDataURL('image/png');
      canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#111827';
      if (pointCount > 0) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
        img.src = data;
      }
    }

    function point(event) {
      const touch = event.touches && event.touches[0] ? event.touches[0] : event;
      const rect = canvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    function start(event) {
      event.preventDefault();
      drawing = true;
      last = point(event);
      pointCount += 1;
      hint.style.display = 'none';
    }

    function move(event) {
      if (!drawing || !last) return;
      event.preventDefault();
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      last = next;
      pointCount += 1;
    }

    function end(event) {
      if (!drawing) return;
      event.preventDefault();
      drawing = false;
      last = null;
    }

    window.clearSignature = function() {
      pointCount = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      hint.style.display = 'flex';
    };

    window.exportSignature = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'signature',
        dataUrl: canvas.toDataURL('image/png'),
        pointCount
      }));
    };

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
    resize();
  </script>
</body>
</html>
`;

async function getDeviceId(): Promise<string | null> {
  const app = Application as unknown as {
    getAndroidId?: () => string | null;
    getIosIdForVendorAsync?: () => Promise<string | null>;
  };
  try {
    if (Platform.OS === 'android' && typeof app.getAndroidId === 'function') {
      return app.getAndroidId() ?? null;
    }
    if (Platform.OS === 'ios' && typeof app.getIosIdForVendorAsync === 'function') {
      return await app.getIosIdForVendorAsync();
    }
  } catch {
    return null;
  }
  return null;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WheelNutConsentScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const webViewRef = useRef<WebView>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signaturePointCount, setSignaturePointCount] = useState(0);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [gps, setGps] = useState<GpsState>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const timestamp = useMemo(() => new Date(), []);

  const deviceLabel = useMemo(
    () => [Device.manufacturer, Device.modelName, Platform.OS].filter(Boolean).join(' · ') || Platform.OS,
    [],
  );

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jobData, profileData] = await Promise.all([
          driverApi.getJob(ref),
          driverApi.getProfile().catch(() => null),
          driverApi.markWheelNutConsentRequired(ref, 'driver_opened_wheel_nut_consent_screen').catch(() => null),
        ]);
        if (cancelled) return;
        setJob(jobData);
        setCustomerName(jobData.customerName || '');
        if (profileData) setProfile(profileData);
      } catch (error) {
        const message =
          error instanceof ApiError && error.code === 'network'
            ? t('common.networkError')
            : error instanceof Error
              ? error.message
              : t('wheelNutConsent.loadFailed');
        Alert.alert(t('common.error'), message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [permission, id] = await Promise.all([
          Location.requestForegroundPermissionsAsync(),
          getDeviceId(),
        ]);
        if (cancelled) return;
        setDeviceId(id);
        if (permission.status !== 'granted') {
          setLocationStatus('unavailable');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        setGps({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        });
        setLocationStatus('ready');
      } catch {
        if (!cancelled) setLocationStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const captureSignature = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.exportSignature && window.exportSignature(); true;');
  }, []);

  const clearSignature = useCallback(() => {
    setSignatureDataUrl(null);
    setSignaturePointCount(0);
    setDeclarationAccepted(false);
    webViewRef.current?.injectJavaScript('window.clearSignature && window.clearSignature(); true;');
  }, []);

  const onSignatureMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        dataUrl?: string;
        pointCount?: number;
      };
      if (data.type !== 'signature' || !data.dataUrl) return;
      setSignatureDataUrl(data.dataUrl);
      setSignaturePointCount(data.pointCount ?? 0);
    } catch {
      // Ignore malformed WebView messages.
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!ref || !job) return;
    if (!customerName.trim()) {
      Alert.alert(t('common.error'), t('wheelNutConsent.customerNameRequired'));
      return;
    }
    if (!signatureDataUrl || signaturePointCount < 6) {
      Alert.alert(t('common.error'), t('wheelNutConsent.signatureRequired'));
      return;
    }
    if (!declarationAccepted) {
      Alert.alert(t('common.error'), t('wheelNutConsent.acceptRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await driverApi.saveWheelNutConsent(ref, {
        customerName: customerName.trim(),
        vehicleReg: job.vehicleReg,
        declarationAccepted,
        signatureDataUrl,
        signaturePointCount,
        gps,
        deviceId,
        deviceLabel,
      });
      successHaptic();
      Alert.alert(t('wheelNutConsent.savedTitle'), t('wheelNutConsent.savedBody'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      errorHaptic();
      const message =
        error instanceof ApiError && error.code === 'network'
          ? t('common.networkError')
          : error instanceof Error
            ? error.message
            : t('wheelNutConsent.saveFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setSubmitting(false);
    }
  }, [
    customerName,
    declarationAccepted,
    deviceId,
    deviceLabel,
    gps,
    job,
    ref,
    router,
    signatureDataUrl,
    signaturePointCount,
    t,
  ]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('wheelNutConsent.header') }} />
        <LoadingScreen />
      </>
    );
  }

  if (!job) {
    return (
      <>
        <Stack.Screen options={{ title: t('wheelNutConsent.header') }} />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{t('jobs.jobNotFound')}</Text>
          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('common.goBack')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const gpsLabel = gps
    ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}${gps.accuracy != null ? ` (+/- ${Math.round(gps.accuracy)}m)` : ''}`
    : locationStatus === 'loading'
      ? t('wheelNutConsent.loadingLocation')
      : t('wheelNutConsent.unavailable');
  const canSubmit = Boolean(signatureDataUrl && signaturePointCount >= 6 && declarationAccepted && customerName.trim());

  return (
    <>
      <Stack.Screen options={{ title: t('wheelNutConsent.header') }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('wheelNutConsent.title')}</Text>

        <View style={styles.warningCard}>
          <View style={styles.warningHeader}>
            <Ionicons name="warning" size={22} color="#FDBA74" />
            <Text style={styles.warningTitle}>{t('wheelNutConsent.noticeTitle')}</Text>
          </View>
          <Text style={styles.bodyText}>{t('wheelNutConsent.noticeBody')}</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>-</Text>
            <Text style={styles.bulletText}>{t('wheelNutConsent.riskNutDestroyed')}</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>-</Text>
            <Text style={styles.bulletText}>{t('wheelNutConsent.riskWheelDamage')}</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>-</Text>
            <Text style={styles.bulletText}>{t('wheelNutConsent.riskReplacement')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('wheelNutConsent.declarationTitle')}</Text>
          <Text style={styles.declarationText}>{t('wheelNutConsent.declaration')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('wheelNutConsent.customerDetails')}</Text>
          <Text style={styles.label}>{t('wheelNutConsent.customerName')}</Text>
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            style={styles.input}
            placeholder={t('wheelNutConsent.customerName')}
            placeholderTextColor={colors.muted}
          />
          <DetailRow label={t('wheelNutConsent.vehicleReg')} value={job.vehicleReg || t('wheelNutConsent.unavailable')} />
          <DetailRow label={t('wheelNutConsent.dateTime')} value={formatDateTime(timestamp)} />
          <DetailRow label={t('wheelNutConsent.driverName')} value={profile?.name || t('wheelNutConsent.unavailable')} />
          <DetailRow label={t('wheelNutConsent.gpsLocation')} value={gpsLabel} />
          <DetailRow label={t('wheelNutConsent.jobNumber')} value={job.refNumber} />
          <DetailRow label={t('wheelNutConsent.deviceId')} value={deviceId || deviceLabel || t('wheelNutConsent.unavailable')} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('wheelNutConsent.signature')}</Text>
          <View style={styles.signatureWrap}>
            <WebView
              ref={webViewRef}
              source={{ html: signatureHtml }}
              originWhitelist={['*']}
              onMessage={onSignatureMessage}
              scrollEnabled={false}
              style={styles.signatureWebView}
            />
          </View>
          <View style={styles.signatureActions}>
            <Pressable onPress={captureSignature} style={styles.secondaryButton}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.text} />
              <Text style={styles.secondaryButtonText}>{t('wheelNutConsent.useSignature')}</Text>
            </Pressable>
            <Pressable onPress={clearSignature} style={styles.secondaryButton}>
              <Ionicons name="refresh-outline" size={18} color={colors.text} />
              <Text style={styles.secondaryButtonText}>{t('wheelNutConsent.clearSignature')}</Text>
            </Pressable>
          </View>
          {signatureDataUrl && signaturePointCount >= 6 && (
            <View style={styles.signedBadge}>
              <Ionicons name="checkmark-circle" size={17} color="#86EFAC" />
              <Text style={styles.signedBadgeText}>{t('wheelNutConsent.signatureCaptured')}</Text>
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: declarationAccepted }}
          onPress={() => setDeclarationAccepted((value) => !value)}
          style={styles.acceptRow}
        >
          <View style={[styles.checkbox, declarationAccepted && styles.checkboxChecked]}>
            {declarationAccepted && <Ionicons name="checkmark" size={15} color="#0B0F1A" />}
          </View>
          <Text style={styles.acceptText}>{t('wheelNutConsent.readUnderstood')}</Text>
        </Pressable>

        <Pressable
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
          style={[styles.primaryButton, (!canSubmit || submitting) && styles.buttonDisabled]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#0B0F1A" />
          ) : (
            <Ionicons name="shield-checkmark" size={20} color="#0B0F1A" />
          )}
          <Text style={styles.primaryButtonText}>
            {submitting ? t('wheelNutConsent.saving') : t('wheelNutConsent.agreeContinue')}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    lineHeight: 30,
  },
  warningCard: {
    backgroundColor: 'rgba(180,83,9,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(253,186,116,0.42)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningTitle: {
    color: '#FDBA74',
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  bodyText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bullet: {
    color: '#FDBA74',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  declarationText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 21,
  },
  label: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  detailRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: spacing.sm,
    gap: 2,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  signatureWrap: {
    height: 184,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.white,
  },
  signatureWebView: {
    flex: 1,
    backgroundColor: colors.white,
  },
  signatureActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    textAlign: 'center',
  },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(134,239,172,0.35)',
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  signedBadgeText: {
    color: '#86EFAC',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  acceptText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: '#0B0F1A',
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
});
