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

interface ContactItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  aiPriority: string | null;
  aiCategory: string | null;
  requiresImmediateCall: boolean | null;
  aiSentiment: string | null;
  createdAt: string | null;
}

interface ContactsResponse {
  items: ContactItem[];
  page: number;
  totalCount: number;
  totalPages: number;
  unreadCount: number;
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London',
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

const PRIORITY_COLORS: Record<string, string> = {
  urgent: colors.danger,
  high: colors.warning,
  medium: colors.accent,
  low: colors.muted,
};

const SENTIMENT_ICONS: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😠',
  urgent: '🚨',
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STATUS_FILTERS = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read' },
];

export function AdminContactsModal({ visible, onClose }: Props) {
  const [items, setItems] = useState<ContactItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('unread');
  const [expanded, setExpanded] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<ContactsResponse>(`/api/mobile/admin/contacts?status=${statusFilter}`);
      if (mountedRef.current) {
        setItems(res.items);
        setUnreadCount(res.unreadCount);
        setTotalCount(res.totalCount);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load contact messages.');
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

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/api/mobile/admin/contacts/${id}`, { status: 'read' });
      await load();
    } catch {
      Alert.alert('Error', 'Failed to update message status.');
    }
  };

  const subtitle = unreadCount > 0
    ? `${unreadCount} unread · ${totalCount} total`
    : `${totalCount} messages`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader title="Contact Messages" subtitle={subtitle} onClose={onClose} />

        <View style={s.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setStatusFilter(f.value)}
              style={[s.filterBtn, statusFilter === f.value && s.filterBtnActive]}
            >
              <Text style={[s.filterTxt, statusFilter === f.value && s.filterTxtActive]}>{f.label}</Text>
              {f.value === 'unread' && unreadCount > 0 && (
                <View style={s.badge}><Text style={s.badgeTxt}>{unreadCount}</Text></View>
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
                <Text style={s.emptyIcon}>✉️</Text>
                <Text style={s.emptyText}>No {statusFilter !== 'all' ? statusFilter : ''} messages.</Text>
              </View>
            ) : (
              items.map((item) => {
                const isExpanded = expanded === item.id;
                const priorityColor = item.aiPriority ? (PRIORITY_COLORS[item.aiPriority] ?? colors.muted) : colors.muted;
                return (
                  <Pressable key={item.id} style={[s.card, item.status === 'unread' && s.cardUnread]} onPress={() => setExpanded(isExpanded ? null : item.id)}>
                    <View style={s.cardHeader}>
                      <View style={s.cardInfo}>
                        <View style={s.cardNameRow}>
                          <Text style={s.cardName}>{item.name}</Text>
                          {item.requiresImmediateCall && (
                            <Text style={s.urgentBadge}>⚡ URGENT CALL</Text>
                          )}
                          {item.aiSentiment && (
                            <Text style={s.sentimentIcon}>{SENTIMENT_ICONS[item.aiSentiment] ?? ''}</Text>
                          )}
                        </View>
                        <Text style={s.cardTime}>{timeAgo(item.createdAt)} · {formatDate(item.createdAt)}</Text>
                      </View>
                      <View style={s.cardMeta}>
                        {item.aiPriority && (
                          <View style={[s.priorityPill, { borderColor: priorityColor, backgroundColor: `${priorityColor}22` }]}>
                            <Text style={[s.priorityTxt, { color: priorityColor }]}>{item.aiPriority}</Text>
                          </View>
                        )}
                        {item.status === 'unread' && <View style={s.unreadDot} />}
                      </View>
                    </View>

                    <Text style={s.cardEmail}>{item.email}</Text>
                    {item.aiCategory && <Text style={s.cardCategory}>Category: {item.aiCategory}</Text>}

                    <Text style={s.cardMsg} numberOfLines={isExpanded ? undefined : 2}>{item.message}</Text>

                    {isExpanded && (
                      <View style={s.expandedActions}>
                        {item.phone && (
                          <Pressable style={[s.actionBtn, s.callBtn]} onPress={() => void Linking.openURL(`tel:${item.phone}`)}>
                            <Text style={s.callBtnTxt}>📞 Call</Text>
                          </Pressable>
                        )}
                        <Pressable style={[s.actionBtn, s.emailBtn]} onPress={() => void Linking.openURL(`mailto:${item.email}`)}>
                          <Text style={s.emailBtnTxt}>✉️ Email</Text>
                        </Pressable>
                        {item.status === 'unread' && (
                          <Pressable style={[s.actionBtn, s.readBtn]} onPress={() => void handleMarkRead(item.id)}>
                            <Text style={s.readBtnTxt}>✓ Mark read</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </AdminModalShell>
    </Modal>
  );
}

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
  cardUnread: { borderColor: colors.accent + '55' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  cardName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  urgentBadge: { backgroundColor: colors.dangerBg, borderRadius: radius.pill, paddingHorizontal: space.xs, paddingVertical: 2, fontSize: 9, color: colors.danger, fontWeight: '900' },
  sentimentIcon: { fontSize: 14 },
  cardTime: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  cardMeta: { alignItems: 'flex-end', gap: 6 },
  priorityPill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  priorityTxt: { fontSize: 10, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  cardEmail: { color: colors.blue, fontSize: fontSize.xs, fontWeight: '600' },
  cardCategory: { color: colors.purple, fontSize: fontSize.xs, fontWeight: '600' },
  cardMsg: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 18 },
  expandedActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, borderWidth: 1 },
  callBtn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  callBtnTxt: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '800' },
  emailBtn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  emailBtnTxt: { color: colors.blue, fontSize: fontSize.xs, fontWeight: '800' },
  readBtn: { borderColor: colors.successBorder, backgroundColor: colors.successBg },
  readBtnTxt: { color: colors.success, fontSize: fontSize.xs, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  retryTxt: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.xs },
  emptyWrap: { alignItems: 'center', paddingVertical: space.xxl, gap: space.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },
} as const);
