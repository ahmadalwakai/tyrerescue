import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { useAdminCustomers } from '@/hooks/useAdminCustomers';
import type { AdminCustomerDetail, AdminCustomerRow, AdminCustomerUpdate, CustomerVerification, CustomerStatusFilter, CustomerAccountAction, CustomerActionResult } from '@/types/admin-customers';
import { CustomerAccountActions, type CustomerActionChoice } from './CustomerAccountActions';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { AppButton, FieldLabel, Input } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  visible: boolean;
  projectId?: string | null;
  onClose: () => void;
  onDismiss?: () => void;
  onCustomerUpdated?: () => void;
}

const FILTERS: { value: CustomerVerification; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified email' },
  { value: 'unverified', label: 'Unverified email' },
];
const STATUS_FILTERS: { value: CustomerStatusFilter; label: string }[] = [
  { value: 'all', label: 'All accounts' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' },
];
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
const MONEY = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function dateLabel(value: string | null): string { return value ? DATE.format(new Date(value)) : 'Not available'; }
function readable(value: string): string { return value.replace(/_/g, ' '); }

function VerificationBadge({ verified }: { verified: boolean }) {
  return <View style={[styles.badge, verified ? styles.verifiedBadge : styles.unverifiedBadge]}>
    <Text style={[styles.badgeText, { color: verified ? colors.success : colors.warning }]}>{verified ? 'Email verified' : 'Email unverified'}</Text>
  </View>;
}

function AccountStatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return <View style={[styles.badge, status === 'active' ? styles.verifiedBadge : styles.suspendedBadge]}>
    <Text style={[styles.badgeText, { color: status === 'active' ? colors.success : colors.danger }]}>{status === 'active' ? 'Active' : 'Suspended'}</Text>
  </View>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.errorBox}>
    <Text style={styles.errorText} accessibilityRole="alert">{message}</Text>
    {onRetry ? <AppButton label="Retry" variant="secondary" onPress={onRetry} /> : null}
  </View>;
}

function CustomerRow({ item, onSelect }: { item: AdminCustomerRow; onSelect: () => void }) {
  return <Pressable testID={`customer-row-${item.id}`} accessibilityRole="button" accessibilityLabel={`Manage ${item.name}, ${item.email}`} onPress={onSelect} style={({ pressed }) => [styles.customerRow, pressed && styles.pressed]}>
    <View style={styles.rowTop}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.trim().slice(0, 1).toUpperCase() || 'C'}</Text></View>
      <View style={styles.flex}><Text style={styles.customerName}>{item.name}</Text><Text style={styles.customerEmail}>{item.email}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </View>
    {item.phone ? <Text style={styles.body}>{item.phone}</Text> : null}
    <View style={styles.rowMeta}><AccountStatusBadge status={item.status} /><VerificationBadge verified={item.emailVerified} /><Text style={styles.caption}>{item.bookingCount} {item.bookingCount === 1 ? 'booking' : 'bookings'}</Text></View>
    <Text style={styles.caption}>Joined {dateLabel(item.createdAt)}</Text>
  </Pressable>;
}

interface DetailProps {
  detail: AdminCustomerDetail;
  busy: boolean;
  error: string | null;
  onSave: (input: AdminCustomerUpdate) => Promise<boolean>;
  onAction: (input: CustomerAccountAction) => Promise<CustomerActionResult | null>;
  onReload: () => void;
  onClearError: () => void;
  onBack: () => void;
  onClose: () => void;
  onCustomerUpdated?: () => void;
}

function CustomerDetails({ detail, busy, error, onSave, onAction, onReload, onClearError, onBack, onClose, onCustomerUpdated }: DetailProps) {
  const { customer } = detail;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [choice, setChoice] = useState<CustomerActionChoice>(null);
  const mounted = useRef(true);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const dirty = name.trim() !== customer.name || (phone.trim() || null) !== customer.phone;

  const navigate = (next: () => void) => {
    if (busy) return;
    const proceed = () => {
      if (mounted.current && api.hasAdminToken && getApiContextRevision() === apiRevision && getAdminSessionRevision() === sessionRevision) next();
    };
    if (editing && dirty) {
      Alert.alert('Discard changes?', 'Your changes to this customer have not been saved.', [
        { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: proceed },
      ]);
    } else proceed();
  };
  const cancelEdit = () => {
    setName(customer.name); setPhone(customer.phone ?? ''); setEditing(false); setValidation(null); onClearError();
  };
  const save = async () => {
    if (busy) return;
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (nextName.length < 2 || nextName.length > 255) { setValidation('Enter a name between 2 and 255 characters.'); return; }
    if (nextPhone && (!/^[+\d\s().-]{5,20}$/.test(nextPhone) || nextPhone.replace(/\D/g, '').length < 5)) {
      setValidation('Enter a valid phone number with at least 5 digits, or leave it blank.'); return;
    }
    setValidation(null);
    if (await onSave({ name: nextName, phone: nextPhone || null, expectedUpdatedAt: customer.updatedAt })) {
      setEditing(false); setSaved(true); onCustomerUpdated?.();
    }
  };

  return <>
    <AdminModalHeader title="Customer account" subtitle={customer.name} onClose={() => navigate(onClose)} />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
      <AppButton label="‹ All customers" variant="ghost" disabled={busy} onPress={() => navigate(onBack)} testID="customer-back" />
      <View style={styles.panel}>
        <View style={styles.rowMeta}><Text style={styles.sectionTitle}>Account details</Text><AccountStatusBadge status={customer.status} /><VerificationBadge verified={customer.emailVerified} /></View>
        {customer.status === 'suspended' ? <View style={styles.errorBox}><Text style={styles.errorText}>Suspended {dateLabel(customer.suspendedAt)}</Text><Text style={styles.body}>{customer.suspensionReason || 'No reason recorded.'}</Text></View> : null}
        {saved ? <Text style={styles.successText} accessibilityRole="alert">Customer details saved.</Text> : null}
        <View><FieldLabel>Email address</FieldLabel><Text style={styles.body} selectable testID="customer-email-readonly">{customer.email}</Text></View>
        {customer.pendingEmail ? <View style={styles.pendingEmail}><Text style={styles.body} selectable>Pending email: {customer.pendingEmail}</Text><Text style={styles.caption}>Awaiting customer verification. Link expires {dateLabel(customer.pendingEmailExpiresAt)}. Current sign-in email remains {customer.email}.</Text></View> : null}
        {editing ? <>
          <View><FieldLabel>Name</FieldLabel><Input accessibilityLabel="Customer name" testID="customer-name-input" value={name} onChangeText={setName} editable={!busy} autoCapitalize="words" maxLength={255} /></View>
          <View><FieldLabel>Phone number</FieldLabel><Input accessibilityLabel="Customer phone number" testID="customer-phone-input" value={phone} onChangeText={setPhone} editable={!busy} keyboardType="phone-pad" maxLength={20} placeholder="Optional phone number" /></View>
          {validation || error ? <ErrorNotice message={validation || error!} /> : null}
          {error ? <AppButton label="Reload latest details" variant="secondary" disabled={busy} onPress={() => navigate(onReload)} testID="customer-reload" /> : null}
          <View style={styles.buttons}>
            <AppButton label="Cancel" variant="secondary" style={styles.flex} disabled={busy} onPress={() => navigate(cancelEdit)} />
            <AppButton label="Save changes" style={styles.flex} loading={busy} disabled={!dirty} onPress={() => { void save(); }} testID="customer-save" />
          </View>
        </> : <>
          <View><FieldLabel>Name</FieldLabel><Text style={styles.body} selectable>{customer.name}</Text></View>
          <View><FieldLabel>Phone number</FieldLabel><Text style={styles.body} selectable>{customer.phone || 'Not provided'}</Text></View>
          <Text style={styles.caption}>Registered {dateLabel(customer.createdAt)}</Text>
          <AppButton label="Edit customer details" variant="secondary" disabled={busy || choice !== null} onPress={() => { setName(customer.name); setPhone(customer.phone ?? ''); setSaved(false); setEditing(true); onClearError(); }} testID="customer-edit" />
        </>}
      </View>
      <View style={styles.panel}><CustomerAccountActions customer={customer} choice={choice} busy={busy} disabled={editing} error={error}
        onChoose={(next) => { if (!busy) { setChoice(next); setSaved(false); onClearError(); } }} onAction={onAction}
        onReload={onReload} onUpdated={() => onCustomerUpdated?.()} onDeleted={() => { onCustomerUpdated?.(); onBack(); }} /></View>
      <View style={styles.panel}>
        <View style={styles.rowMeta}><Text style={styles.sectionTitle}>Booking history</Text><Text style={styles.total}>{detail.stats.totalBookings}</Text></View>
        {detail.bookings.length === 0 ? <Text style={styles.body}>No bookings linked to this account yet.</Text> : <>
          <Text style={styles.caption}>Latest {detail.bookings.length} of {detail.stats.totalBookings} linked bookings</Text>
          {detail.bookings.map((booking) => <View style={styles.booking} key={booking.id} testID={`customer-booking-${booking.id}`}>
            <View style={styles.rowMeta}><Text style={styles.bookingRef} selectable>{booking.refNumber}</Text><Text style={styles.body}>{MONEY.format(Number(booking.totalAmount))}</Text></View>
            <Text style={styles.bookingStatus}>{readable(booking.status)}</Text>
            <Text style={styles.body}>{readable(booking.serviceType)} · {readable(booking.bookingType)}</Text>
            <Text style={styles.caption}>{booking.scheduledAt ? `Scheduled ${dateLabel(booking.scheduledAt)}` : `Created ${dateLabel(booking.createdAt)}`}</Text>
          </View>)}
        </>}
      </View>
    </ScrollView>
  </>;
}

function CustomerManager({ onClose, onCustomerUpdated }: Pick<Props, 'onClose' | 'onCustomerUpdated'>) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState({ search: '', verification: 'all' as CustomerVerification, status: 'all' as CustomerStatusFilter, page: 1 });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const customers = useAdminCustomers({ ...query, customerId });

  useEffect(() => {
    const timer = setTimeout(() => setQuery((previous) => previous.search === searchInput.trim() ? previous : { ...previous, search: searchInput.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  if (customerId) {
    if (customers.detail) return <CustomerDetails
      key={customers.detail.customer.id}
      detail={customers.detail} busy={customers.saveBusy} error={customers.saveError}
      onSave={customers.save} onClearError={customers.clearSaveError}
      onAction={customers.performAction}
      onReload={() => { void customers.refreshDetail(); }} onBack={() => setCustomerId(null)} onClose={onClose} onCustomerUpdated={onCustomerUpdated}
    />;
    return <>
      <AdminModalHeader title="Customer account" onClose={onClose} />
      <View style={styles.content}><AppButton label="‹ All customers" variant="ghost" onPress={() => setCustomerId(null)} />
        {customers.detailError ? <ErrorNotice message={customers.detailError} onRetry={() => { void customers.refreshDetail(); }} />
          : <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /><Text style={styles.body}>Loading customer…</Text></View>}
      </View>
    </>;
  }

  const list = customers.list;
  const searching = searchInput.trim() !== query.search;
  const loading = customers.listLoading || searching;
  const count = list ? `${list.total.toLocaleString('en-GB')} ${query.search || query.verification !== 'all' || query.status !== 'all' ? 'matching ' : ''}customer${list.total === 1 ? '' : 's'}` : 'Search and manage customer accounts';
  return <>
    <AdminModalHeader title="Customers" subtitle={count} onClose={onClose} />
    <View style={styles.searchArea}>
      <Input value={searchInput} onChangeText={setSearchInput} placeholder="Search name, email or phone" accessibilityLabel="Search customers by name, email or phone" testID="customer-search" autoCapitalize="none" autoCorrect={false} maxLength={200} returnKeyType="search"
        onSubmitEditing={() => setQuery((previous) => ({ ...previous, search: searchInput.trim(), page: 1 }))} />
      <View style={styles.filters}>{STATUS_FILTERS.map((filter) => <Pressable key={filter.value} accessibilityRole="button" accessibilityLabel={filter.label} accessibilityState={{ selected: query.status === filter.value }} testID={`customer-status-${filter.value}`} onPress={() => setQuery((previous) => ({ ...previous, status: filter.value, page: 1 }))}
        style={[styles.filter, query.status === filter.value && styles.filterActive]}><Text style={[styles.filterText, query.status === filter.value && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}</View>
      <View style={styles.filters}>{FILTERS.map((filter) => <Pressable key={filter.value} accessibilityRole="button" accessibilityLabel={filter.label} accessibilityState={{ selected: query.verification === filter.value }} testID={`customer-filter-${filter.value}`} onPress={() => setQuery((previous) => ({ ...previous, verification: filter.value, page: 1 }))}
        style={[styles.filter, query.verification === filter.value && styles.filterActive]}><Text style={[styles.filterText, query.verification === filter.value && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}</View>
    </View>
    {customers.listError ? <View style={styles.errorMargin}><ErrorNotice message={customers.listError} onRetry={() => { void customers.refreshList(); }} /></View> : null}
    {loading && !list ? <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /><Text style={styles.body}>Loading customers…</Text></View>
      : <FlatList
        key={`${query.search}:${query.verification}:${query.status}:${query.page}`}
        data={searching ? [] : list?.customers ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CustomerRow item={item} onSelect={() => setCustomerId(item.id)} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={customers.listLoading} onRefresh={() => { void customers.refreshList(); }} tintColor={colors.accent} />}
        ListEmptyComponent={!customers.listError && !loading ? <View style={styles.empty}><Text style={styles.sectionTitle}>No customers found</Text><Text style={styles.emptyText}>{query.search || query.verification !== 'all' ? 'Try another search or email filter.' : 'Registered customer accounts will appear here.'}</Text></View> : null}
        ListFooterComponent={list && (list.totalPages > 1 || query.page > 1) ? <View style={styles.pagination}>
          <Text style={styles.caption}>{query.page > list.totalPages ? 'This page is now empty. Go back to the previous page.' : `Page ${list.page} of ${list.totalPages}`}</Text>
          <View style={styles.buttons}>
            <AppButton label="Previous" variant="secondary" style={styles.flex} disabled={loading || query.page <= 1} testID="customer-previous" onPress={() => setQuery((previous) => ({ ...previous, page: previous.page - 1 }))} />
            <AppButton label="Next" variant="secondary" style={styles.flex} disabled={loading || query.page >= list.totalPages} testID="customer-next" onPress={() => setQuery((previous) => ({ ...previous, page: previous.page + 1 }))} />
          </View>
        </View> : null}
      />}
  </>;
}

export function AdminCustomersModal({ visible, projectId, onClose, onDismiss, onCustomerUpdated }: Props) {
  const active = visible && api.hasAdminToken;
  const scopeKey = `${projectId ?? 'tyrerescue'}:${getApiContextRevision()}:${getAdminSessionRevision()}`;
  return <Modal visible={active} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} onDismiss={onDismiss}>
    <AdminModalShell>{active ? <CustomerManager key={scopeKey} onClose={onClose} onCustomerUpdated={onCustomerUpdated} /> : null}</AdminModalShell>
  </Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  searchArea: { padding: space.lg, gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  filter: { minHeight: 44, paddingHorizontal: space.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill },
  filterActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  filterText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.muted },
  filterTextActive: { color: colors.accent },
  listContent: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  customerRow: { backgroundColor: colors.card, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: space.sm },
  pressed: { borderColor: colors.accent, backgroundColor: colors.panel },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  avatar: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },
  customerName: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  customerEmail: { color: colors.muted, fontSize: fontSize.xs, marginTop: 3 },
  chevron: { color: colors.accent, fontSize: 28 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  verifiedBadge: { backgroundColor: colors.successBg },
  unverifiedBadge: { backgroundColor: colors.warningBg },
  suspendedBadge: { backgroundColor: colors.dangerBg },
  pendingEmail: { borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radius.md, padding: space.sm, gap: space.xs, backgroundColor: colors.warningBg },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  body: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  caption: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  total: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, padding: space.md, gap: space.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  booking: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, gap: space.xs },
  bookingRef: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  bookingStatus: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'capitalize' },
  errorBox: { padding: space.md, gap: space.sm, backgroundColor: colors.dangerBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.dangerBorder },
  errorMargin: { marginHorizontal: space.lg, marginTop: space.sm },
  errorText: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
  successText: { color: colors.success, fontSize: fontSize.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  empty: { paddingVertical: space.xl, alignItems: 'center', gap: space.sm },
  emptyText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  pagination: { alignItems: 'stretch', gap: space.sm, marginTop: space.md },
});
