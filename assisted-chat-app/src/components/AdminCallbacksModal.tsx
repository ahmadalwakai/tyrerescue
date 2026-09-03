import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, radius, space } from './theme';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface CallbackItem {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  status: string;
  resolvedAt: string | null;
  createdAt: string | null;
}

interface CallbacksResponse {
  items: CallbackItem[];
  page: number;
  totalCount: number;
  totalPages: number;
  pendingCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: 'Europe/London',
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try { return DATE_FMT.format(new Date(iso)); } catch { return iso; }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

// ── Main component ────────────────────────────────────────────────────────

export function AdminCallbacksModal({ visible, onClose }: Props) {
  const [items, setItems] = useState<CallbackItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<CallbacksResponse>(`/api/mobile/admin/callbacks?status=${statusFilter}`);
      if (mountedRef.current) {
        setItems(res.items);
        setPendingCount(res.pendingCount);
        setTotalCount(res.totalCount);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load callbacks.');
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [statusFilter]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const handleCall = (phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  };

  const handleResolve = async (id: string, name: string) => {
    Alert.alert(
      'Mark as Resolved',
      `Mark callback from ${name} as resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolved',
          style: 'default',
          onPress: async () => {
            setResolvingId(id);
            try {
              await api.patch(`/api/mobile/admin/callbacks/${id}`, { status: 'resolved' });
              await load();
            } catch {
              Alert.alert('Error', 'Failed to update callback status.');
            } finally {
              if (mountedRef.current) setResolvingId(null);
            }
          },
        },
      ],
    );
  };

  const subtitle = pendingCount > 0
    ? `${pendingCount} pending · ${totalCount} total`
    : `${totalCount} total`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader
          title="Call Me Back"
          subtitle={subtitle}
          onClose={onClose}
        />

        {/* Status filter */}
        <View style={s.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setStatusFilter(f.value)}
              style={[s.filterBtn, statusFilter === f.value && s.filterBtnActive]}
            >
              <Text style={[s.filterTxt, statusFilter === f.value && s.filterTxtActive]}>{f.label}</Text>
              {f.value === 'pending' && pendingCount > 0 && (
                <View style={s.badge}><Text style={s.badgeTxt}>{pendingCount}</Text></View>
              )}
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>
        ) : error ? (
          <View style={s.center}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={s.retryBtn}><Text style={s.retryTxt}>Retry</Text></Pressable>
          </View>
        ) : (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />}
          >
            {items.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyIcon}>📞</Text>
                <Text style={s.emptyText}>No {statusFilter !== 'all' ? statusFilter : ''} callbacks.</Text>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.id} style={[s.card, item.status === 'pending' && s.cardPending]}>
                  <View style={s.cardHeader}>
                    <View style={s.cardInfo}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <Text style={s.cardTime}>{timeAgo(item.createdAt)} · {formatDate(item.createdAt)}</Text>
                    </View>
                    <View style={[s.statusPill, item.status === 'pending' ? s.statusPending : s.statusResolved]}>
                      <Text style={s.statusTxt}>{item.status === 'pending' ? 'Pending' : 'Resolved'}</Text>
                    </View>
                  </View>

                  <Text style={s.cardPhone}>{item.phone}</Text>
                  {item.notes ? <Text style={s.cardNotes}>{item.notes}</Text> : null}

                  {item.status === 'resolved' && item.resolvedAt ? (
                    <Text style={s.resolvedAt}>Resolved {formatDate(item.resolvedAt)}</Text>
                  ) : null}

                  <View style={s.cardActions}>
                    <Pressable style={[s.actionBtn, s.callBtn]} onPress={() => handleCall(item.phone)}>
                      <Text style={s.callBtnTxt}>📞 Call Now</Text>
                    </Pressable>
                    {item.status === 'pending' && (
                      <Pressable
                        style={[s.actionBtn, s.resolveBtn, resolvingId === item.id && s.actionBtnDisabled]}
                        onPress={() => void handleResolve(item.id, item.name)}
                        disabled={resolvingId === item.id}
                      >
                        {resolvingId === item.id
                          ? <ActivityIndicator color={colors.accentText} size="small" />
                          : <Text style={s.resolveBtnTxt}>✓ Resolved</Text>}
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </AdminModalShell>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  filterBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterTxt: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  filterTxtActive: { color: colors.accentText },
  badge: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: 48, gap: space.md },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, gap: space.sm },
  cardPending: { borderColor: colors.warningBorder },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1 },
  cardName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  cardTime: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  statusPill: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusPending: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder },
  statusResolved: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder },
  statusTxt: { fontSize: 10, fontWeight: '800', color: colors.text },
  cardPhone: { color: colors.accent, fontSize: fontSize.md, fontWeight: '900' },
  cardNotes: { color: colors.muted, fontSize: fontSize.xs, fontStyle: 'italic' },
  resolvedAt: { color: colors.success, fontSize: fontSize.xs },
  cardActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  actionBtn: { flex: 1, paddingVertical: space.sm, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionBtnDisabled: { opacity: 0.5 },
  callBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  callBtnTxt: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '800' },
  resolveBtn: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder },
  resolveBtnTxt: { color: colors.success, fontSize: fontSize.xs, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  retryTxt: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.xs },
  emptyWrap: { alignItems: 'center', paddingVertical: space.xxl, gap: space.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
} as const);
