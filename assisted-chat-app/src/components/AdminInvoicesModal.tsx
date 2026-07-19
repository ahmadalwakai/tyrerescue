import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fontSize, radius, space } from './theme';
import { api, API_BASE_URL, getAdminToken } from '@/lib/api';
import { AdminHeaderButton, AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import {
  useAdminInvoices,
  useInvoiceDetail,
  type InvoiceRow,
} from '@/hooks/useAdminInvoices';

// ── Status config ─────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLOR: Record<string, string> = {
  draft: '#A1A1AA',
  issued: '#F97316',
  sent: '#8B5CF6',
  paid: '#22C55E',
  overdue: '#EF4444',
  archived: '#71717A',
  cancelled: '#EF4444',
};
const STATUS_BG: Record<string, string> = {
  draft: 'rgba(161,161,170,0.15)',
  issued: 'rgba(249,115,22,0.15)',
  sent: 'rgba(139,92,246,0.15)',
  paid: 'rgba(34,197,94,0.15)',
  overdue: 'rgba(239,68,68,0.15)',
  archived: 'rgba(161,161,170,0.1)',
  cancelled: 'rgba(239,68,68,0.1)',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); }
  catch { return '—'; }
}
function fmtGbp(s: string | null | undefined): string {
  if (!s) return '£0.00';
  return `£${parseFloat(s).toFixed(2)}`;
}
function today(): string { return new Date().toISOString().slice(0, 10); }
function in30days(): string { return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); }

// ── Shared atoms ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[s.badge, { backgroundColor: STATUS_BG[status] ?? 'transparent' }]}>
      <Text style={[s.badgeText, { color: STATUS_COLOR[status] ?? colors.muted }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function ActionPill({ label, color, loading, onPress, disabled }: {
  label: string; color: string; loading?: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading || disabled} style={[s.pill, { borderColor: color }]}>
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Text style={[s.pillText, { color }]}>{label}</Text>}
    </Pressable>
  );
}

function FieldInput({ label, value, onChange, placeholder, keyboardType, required, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  required?: boolean; multiline?: boolean;
}) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}{required ? ' *' : ''}</Text>
      <TextInput
        style={[s.input, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

// ── Invoice create / edit form ────────────────────────────────────────────

interface LineItem { key: number; description: string; quantity: string; unitPrice: string; }
let keyCounter = 1;

interface CreateFormProps {
  invoiceId?: string;        // if set = edit mode
  initialData?: {
    customerName: string; customerEmail: string; customerPhone: string;
    customerAddress: string; issueDate: string; dueDate: string;
    notes: string; internalNotes: string; bookingId: string;
    items: { description: string; quantity: number; unitPrice: string }[];
  };
  onSuccess: () => void;
  onCancel: () => void;
}

function InvoiceFormView({ invoiceId, initialData, onSuccess, onCancel }: CreateFormProps) {
  const isEdit = !!invoiceId;
  const [form, setForm] = useState({
    customerName: initialData?.customerName ?? '',
    customerEmail: initialData?.customerEmail ?? '',
    customerPhone: initialData?.customerPhone ?? '',
    customerAddress: initialData?.customerAddress ?? '',
    issueDate: initialData?.issueDate ?? today(),
    dueDate: initialData?.dueDate ?? in30days(),
    notes: initialData?.notes ?? '',
    internalNotes: initialData?.internalNotes ?? '',
    bookingId: initialData?.bookingId ?? '',
  });
  const [items, setItems] = useState<LineItem[]>(() =>
    initialData?.items?.length
      ? initialData.items.map((it) => ({ key: keyCounter++, description: it.description, quantity: String(it.quantity), unitPrice: it.unitPrice }))
      : [{ key: keyCounter++, description: '', quantity: '1', unitPrice: '' }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field: string) => (v: string) => setForm((p) => ({ ...p, [field]: v }));
  const updateItem = (key: number, field: keyof LineItem) => (v: string) =>
    setItems((p) => p.map((it) => (it.key === key ? { ...it, [field]: v } : it)));
  const addItem = () => setItems((p) => [...p, { key: keyCounter++, description: '', quantity: '1', unitPrice: '' }]);
  const removeItem = (key: number) => setItems((p) => p.length > 1 ? p.filter((it) => it.key !== key) : p);

  const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0);

  async function handleSubmit() {
    if (!form.customerName.trim() || !form.customerEmail.trim()) { setError('Name and email are required'); return; }
    if (items.some((it) => !it.description.trim())) { setError('All line items need a description'); return; }
    setLoading(true); setError('');
    try {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const payload = {
        ...form,
        bookingId: form.bookingId && UUID_RE.test(form.bookingId) ? form.bookingId : null,
        items: items.map((it) => {
          const qty = parseInt(it.quantity) || 1;
          const unit = parseFloat(it.unitPrice) || 0;
          return { description: it.description, quantity: qty, unitPrice: unit, totalPrice: parseFloat((qty * unit).toFixed(2)) };
        }),
      };
      if (isEdit) {
        await api.patch(`/api/mobile/admin/invoices/${invoiceId}`, payload);
      } else {
        await api.post('/api/mobile/admin/invoices', payload);
      }
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save invoice');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AdminModalHeader title={isEdit ? 'Edit Invoice' : 'New Invoice'} onClose={onCancel} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">

        {/* Customer */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Customer Details</Text>
          <View style={s.grid2}>
            <FieldInput label="Name" value={form.customerName} onChange={update('customerName')} required />
            <FieldInput label="Email" value={form.customerEmail} onChange={update('customerEmail')} keyboardType="email-address" required />
            <FieldInput label="Phone" value={form.customerPhone} onChange={update('customerPhone')} keyboardType="phone-pad" />
            <FieldInput label="Address" value={form.customerAddress} onChange={update('customerAddress')} />
          </View>
        </View>

        {/* Invoice details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Invoice Details</Text>
          <View style={s.grid2}>
            <FieldInput label="Issue Date (YYYY-MM-DD)" value={form.issueDate} onChange={update('issueDate')} placeholder="2026-05-15" />
            <FieldInput label="Due Date (YYYY-MM-DD)" value={form.dueDate} onChange={update('dueDate')} placeholder="2026-06-15" />
          </View>
          <FieldInput label="Linked Booking ID (optional UUID)" value={form.bookingId} onChange={update('bookingId')} placeholder="Leave blank for standalone invoice" />
        </View>

        {/* Line items */}
        <View style={s.section}>
          <View style={[s.row, { marginBottom: space.md }]}>
            <Text style={s.sectionTitle}>Line Items</Text>
            <Pressable onPress={addItem} style={s.addItemBtn}>
              <Text style={s.addItemBtnText}>+ Add Item</Text>
            </Pressable>
          </View>
          {/* Column headers */}
          <View style={s.lineHeader}>
            <Text style={[s.lineHeaderText, { flex: 3 }]}>Description</Text>
            <Text style={[s.lineHeaderText, { width: 50 }]}>Qty</Text>
            <Text style={[s.lineHeaderText, { width: 80 }]}>Price</Text>
            <Text style={[s.lineHeaderText, { width: 30 }]}> </Text>
          </View>
          {items.map((it) => (
            <View key={it.key} style={s.lineRow}>
              <TextInput
                style={[s.input, { flex: 3 }]}
                value={it.description}
                onChangeText={updateItem(it.key, 'description')}
                placeholder="e.g. Mobile tyre fitting"
                placeholderTextColor={colors.subtle}
              />
              <TextInput
                style={[s.input, { width: 50 }]}
                value={it.quantity}
                onChangeText={updateItem(it.key, 'quantity')}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor={colors.subtle}
              />
              <TextInput
                style={[s.input, { width: 80 }]}
                value={it.unitPrice}
                onChangeText={updateItem(it.key, 'unitPrice')}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={colors.subtle}
              />
              <Pressable onPress={() => removeItem(it.key)} style={s.removeBtn} disabled={items.length === 1}>
                <Text style={[s.removeBtnText, items.length === 1 && { opacity: 0.2 }]}>×</Text>
              </Pressable>
            </View>
          ))}
          {/* Totals */}
          <View style={s.totalsBox}>
            <View style={s.row}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsVal}>£{subtotal.toFixed(2)}</Text>
            </View>
            <View style={[s.row, { borderTopWidth: 2, borderTopColor: colors.accent, paddingTop: space.xs, marginTop: space.xs }]}>
              <Text style={[s.totalsLabel, { color: colors.text, fontWeight: '700' }]}>Total</Text>
              <Text style={[s.totalsVal, { color: colors.accent, fontWeight: '800' }]}>£{subtotal.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notes</Text>
          <View style={s.grid2}>
            <FieldInput label="Notes (visible on invoice)" value={form.notes} onChange={update('notes')} multiline />
            <FieldInput label="Internal Notes (admin only)" value={form.internalNotes} onChange={update('internalNotes')} multiline />
          </View>
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <Pressable onPress={handleSubmit} disabled={loading} style={[s.submitBtn, loading && { opacity: 0.6 }]}>
          {loading
            ? <ActivityIndicator color={colors.accentText} />
            : <Text style={s.submitBtnText}>{isEdit ? 'Save Changes' : 'Create Invoice'}</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Invoice detail view ───────────────────────────────────────────────────

function InvoiceDetailView({ invoiceId, onClose, onEdit, onAction, actionLoading }: {
  invoiceId: string;
  onClose: () => void;
  onEdit: () => void;
  onAction: (id: string, action: 'send' | 'archive' | 'delete' | 'markPaid') => void;
  actionLoading: string | null;
}) {
  const { detail, loading } = useInvoiceDetail(invoiceId, true);
  const busy = actionLoading === invoiceId;

  function openPdf() {
    const token = getAdminToken();
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${API_BASE_URL}/api/mobile/admin/invoices/${invoiceId}/pdf${qs}`;
    void Linking.openURL(url);
  }

  return (
    <View style={{ flex: 1 }}>
      <AdminModalHeader
        title={detail?.invoiceNumber ?? '...'}
        onClose={onClose}
        actions={detail && !detail.deletedAt ? (
          <AdminHeaderButton label="Edit" onPress={onEdit} />
        ) : null}
      />

      {loading || !detail ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.md, paddingBottom: 40 }}>
          {/* Status + amount */}
          <View style={[s.card, s.row]}>
            <StatusBadge status={detail.status} />
            <Text style={[s.amountLarge, { color: STATUS_COLOR[detail.status] ?? colors.accent }]}>{fmtGbp(detail.totalAmount)}</Text>
          </View>

          {/* Customer */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Customer</Text>
            <Text style={s.fieldVal}>{detail.customerName}</Text>
            <Text style={s.fieldMuted}>{detail.customerEmail}</Text>
            {detail.customerPhone ? <Text style={s.fieldMuted}>{detail.customerPhone}</Text> : null}
            {detail.customerAddress ? <Text style={s.fieldMuted}>{detail.customerAddress}</Text> : null}
          </View>

          {/* Invoice date */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Invoice Date</Text>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldKey}>Issue Date</Text>
                <Text style={s.fieldVal}>{fmtDate(detail.issueDate)}</Text>
              </View>
            </View>
          </View>

          {/* Final total only */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Final Total</Text>
            <View style={[s.row, { marginTop: space.xs }]}>
              <Text style={[s.fieldKey, { color: colors.text, fontWeight: '800' }]}>TOTAL</Text>
              <Text style={[s.amountLarge, { color: colors.accent }]}>{fmtGbp(detail.totalAmount)}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Actions</Text>
            <View style={s.pillRow}>
              <ActionPill label="Download PDF" color={colors.info} loading={false} onPress={openPdf} />
              {detail.status !== 'paid' && detail.status !== 'cancelled' && detail.status !== 'archived' && (
                <>
                  <ActionPill label="Send Invoice" color={STATUS_COLOR.sent} loading={busy} onPress={() => onAction(detail.id, 'send')} />
                  <ActionPill label="Mark Paid" color={STATUS_COLOR.paid} loading={busy} onPress={() => onAction(detail.id, 'markPaid')} />
                </>
              )}
              {detail.status !== 'archived' && (
                <ActionPill label="Archive" color={colors.muted} loading={busy} onPress={() => onAction(detail.id, 'archive')} />
              )}
              <ActionPill label="Delete" color={colors.danger} loading={busy} onPress={() => {
                Alert.alert('Delete Invoice', `Delete ${detail.invoiceNumber}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { onAction(detail.id, 'delete'); onClose(); } },
                ]);
              }} />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Invoice list card ─────────────────────────────────────────────────────

function InvoiceCard({ inv, onView, onAction, actionLoading }: {
  inv: InvoiceRow;
  onView: () => void;
  onAction: (id: string, action: 'send' | 'archive' | 'delete' | 'markPaid') => void;
  actionLoading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const busy = actionLoading === inv.id;
  return (
    <View style={s.invoiceCard}>
      <Pressable onPress={() => setExpanded((x) => !x)} style={s.invoiceCardTop}>
        <View style={{ flex: 1 }}>
          <View style={[s.row, { marginBottom: 2 }]}>
            <Text style={s.invoiceNumber}>{inv.invoiceNumber}</Text>
            <StatusBadge status={inv.status} />
          </View>
          <Text style={s.customerName} numberOfLines={1}>{inv.customerName}</Text>
          <Text style={s.fieldMuted} numberOfLines={1}>{inv.customerEmail}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.amount, { color: STATUS_COLOR[inv.status] ?? colors.accent }]}>{fmtGbp(inv.totalAmount)}</Text>
          <Text style={s.fieldMuted}>{fmtDate(inv.issueDate)}</Text>
          <Text style={[s.expandArrow, { color: expanded ? colors.accent : colors.subtle }]}>{expanded ? '▴' : '▾'}</Text>
        </View>
      </Pressable>

      {expanded && (
        <View style={s.invoiceCardExpanded}>
          <View style={[s.row, { marginBottom: space.sm }]}>
            <View>
              {inv.dueDate && (<><Text style={s.fieldKey}>Due</Text><Text style={[s.fieldVal, { color: colors.warning }]}>{fmtDate(inv.dueDate)}</Text></>)}
            </View>
            <Pressable onPress={onView} style={s.viewBtn}>
              <Text style={s.viewBtnText}>View Details →</Text>
            </Pressable>
          </View>
          <View style={s.pillRow}>
            {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'archived' && (
              <>
                <ActionPill label="Send" color={STATUS_COLOR.sent} loading={busy} onPress={() => onAction(inv.id, 'send')} />
                <ActionPill label="Mark Paid" color={STATUS_COLOR.paid} loading={busy} onPress={() => onAction(inv.id, 'markPaid')} />
              </>
            )}
            {inv.status !== 'archived' && (
              <ActionPill label="Archive" color={colors.muted} loading={busy} onPress={() => onAction(inv.id, 'archive')} />
            )}
            <ActionPill label="Delete" color={colors.danger} loading={busy} onPress={() => {
              Alert.alert('Delete Invoice', `Delete ${inv.invoiceNumber}?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onAction(inv.id, 'delete') },
              ]);
            }} />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────

type Screen = 'list' | 'create' | 'edit' | 'detail';

interface Props { visible: boolean; onClose: () => void; }

export function AdminInvoicesModal({ visible, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const {
    invoices, total, totalPages, page, status,
    loading, error, actionLoading, toast,
    refresh, applySearch, applyStatus, goPage, doAction,
  } = useAdminInvoices(visible);

  const { detail: editDetail } = useInvoiceDetail(
    screen === 'edit' ? selectedId : null,
    screen === 'edit' && !!selectedId
  );

  function handleAction(id: string, action: 'send' | 'archive' | 'delete' | 'markPaid') {
    void doAction(id, action);
    if (action === 'delete') { setScreen('list'); setSelectedId(null); }
  }

  function handleCreateSuccess() {
    setScreen('list');
    refresh();
  }
  function handleEditSuccess() {
    setScreen('detail');
    refresh();
  }

  // Which inner view to render
  const showList = screen === 'list';
  const showCreate = screen === 'create';
  const showEdit = screen === 'edit' && !!selectedId;
  const showDetail = screen === 'detail' && !!selectedId;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {
      if (screen !== 'list') { setScreen(showEdit ? 'detail' : 'list'); } else { onClose(); }
    }}>
      <AdminModalShell>

        {/* ── List ── */}
        {showList && (
          <>
            <AdminModalHeader
              title="Invoices"
              subtitle={`${total} total`}
              onClose={onClose}
              actions={
                <>
                  <AdminHeaderButton label="+ New" onPress={() => setScreen('create')} primary />
                  <AdminHeaderButton label={loading ? '...' : 'Refresh'} onPress={refresh} disabled={loading} />
                </>
              }
            />

            {toast && (
              <View style={[s.toast, { backgroundColor: toast.ok ? colors.successBg : colors.dangerBg, borderColor: toast.ok ? colors.successBorder : colors.dangerBorder }]}>
                <Text style={[s.toastText, { color: toast.ok ? colors.success : colors.danger }]}>{toast.text}</Text>
              </View>
            )}

            {/* Search */}
            <View style={s.searchRow}>
              <TextInput
                style={s.searchInput}
                placeholder="Search by name, email, invoice #…"
                placeholderTextColor={colors.subtle}
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={() => applySearch(searchInput)}
                returnKeyType="search"
              />
              <Pressable onPress={() => applySearch(searchInput)} style={s.searchBtn}>
                <Text style={s.searchBtnText}>Go</Text>
              </Pressable>
            </View>

            {/* Status filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterBar}>
              {STATUS_OPTIONS.map((opt) => (
                <Pressable key={opt.value} onPress={() => applyStatus(opt.value)} style={[s.filterBtn, status === opt.value && s.filterBtnActive]}>
                  <Text style={[s.filterBtnText, status === opt.value && { color: STATUS_COLOR[opt.value] ?? colors.accent }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Invoice list */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent}>
              {error && <Text style={s.errorText}>{error}</Text>}
              {loading && invoices.length === 0
                ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
                : invoices.length === 0
                ? <Text style={s.emptyText}>No invoices found</Text>
                : invoices.map((inv) => (
                    <InvoiceCard
                      key={inv.id}
                      inv={inv}
                      onView={() => { setSelectedId(inv.id); setScreen('detail'); }}
                      onAction={handleAction}
                      actionLoading={actionLoading}
                    />
                  ))}

              {totalPages > 1 && (
                <View style={s.pagination}>
                  <Pressable onPress={() => goPage(page - 1)} disabled={page <= 1} style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]}>
                    <Text style={s.pageBtnText}>‹ Prev</Text>
                  </Pressable>
                  <Text style={s.pageInfo}>{page} / {totalPages}</Text>
                  <Pressable onPress={() => goPage(page + 1)} disabled={page >= totalPages} style={[s.pageBtn, page >= totalPages && s.pageBtnDisabled]}>
                    <Text style={s.pageBtnText}>Next ›</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </>
        )}

        {/* ── Create ── */}
        {showCreate && (
          <InvoiceFormView
            onSuccess={handleCreateSuccess}
            onCancel={() => setScreen('list')}
          />
        )}

        {/* ── Edit ── */}
        {showEdit && editDetail && (
          <InvoiceFormView
            invoiceId={selectedId!}
            initialData={{
              customerName: editDetail.customerName,
              customerEmail: editDetail.customerEmail,
              customerPhone: editDetail.customerPhone ?? '',
              customerAddress: editDetail.customerAddress ?? '',
              issueDate: editDetail.issueDate ? editDetail.issueDate.slice(0, 10) : today(),
              dueDate: editDetail.dueDate ? editDetail.dueDate.slice(0, 10) : in30days(),
              notes: editDetail.notes ?? '',
              internalNotes: editDetail.internalNotes ?? '',
              bookingId: editDetail.bookingId ?? '',
              items: editDetail.items.map((it) => ({
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              })),
            }}
            onSuccess={handleEditSuccess}
            onCancel={() => setScreen('detail')}
          />
        )}
        {showEdit && !editDetail && <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />}

        {/* ── Detail ── */}
        {showDetail && (
          <InvoiceDetailView
            invoiceId={selectedId!}
            onClose={() => { setScreen('list'); setSelectedId(null); }}
            onEdit={() => setScreen('edit')}
            onAction={handleAction}
            actionLoading={actionLoading}
          />
        )}
      </AdminModalShell>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // List header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.subtle, marginTop: 2 },
  newBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.xs, justifyContent: 'center',
  },
  newBtnText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.sm },
  iconBtn: { padding: space.sm },
  iconBtnText: { fontSize: fontSize.lg, color: colors.muted },

  toast: { marginHorizontal: space.lg, marginTop: space.sm, padding: space.sm, borderRadius: radius.md, borderWidth: 1 },
  toastText: { fontSize: fontSize.sm, fontWeight: '600', textAlign: 'center' },

  searchRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  searchInput: {
    flex: 1, height: 40, backgroundColor: colors.inputBg,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: space.md, color: colors.text, fontSize: fontSize.sm,
  },
  searchBtn: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    backgroundColor: colors.accent, borderRadius: radius.md, justifyContent: 'center',
  },
  searchBtnText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.sm },

  filterScroll: { flexGrow: 0 },
  filterBar: { flexDirection: 'row', paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  filterBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelSoft },
  filterBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(255,121,0,0.16)' },
  filterBtnText: { fontSize: fontSize.xs, color: colors.muted },

  listContent: { padding: space.md, paddingBottom: 40 },
  emptyText: { color: colors.subtle, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.lg },

  // Invoice list card
  invoiceCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderStrong, marginBottom: space.sm, overflow: 'hidden',
    shadowColor: colors.blue,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  invoiceCardTop: { padding: space.md, flexDirection: 'row', gap: space.sm },
  invoiceCardExpanded: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.md },
  invoiceNumber: { fontSize: fontSize.md, fontWeight: '700', color: colors.accent, marginRight: space.sm },
  customerName: { fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  amount: { fontSize: fontSize.lg, fontWeight: '800', fontFamily: 'monospace' },
  expandArrow: { fontSize: fontSize.sm, marginTop: 4 },
  viewBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accent, backgroundColor: 'rgba(255,121,0,0.12)' },
  viewBtnText: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '600' },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    borderRadius: radius.sm, borderWidth: 1,
    minWidth: 80, alignItems: 'center', justifyContent: 'center', height: 32,
  },
  pillText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Badge
  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Pagination
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, marginTop: space.md },
  pageBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: fontSize.sm, color: colors.muted },
  pageInfo: { fontSize: fontSize.sm, color: colors.subtle, fontFamily: 'monospace' },

  // Form
  formHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  formTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  closeBtn: {
    padding: space.sm, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  closeBtnText: { fontSize: fontSize.md, color: colors.muted },
  formBody: { padding: space.md, paddingBottom: 80 },
  section: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: space.md, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.borderStrong,
    shadowColor: colors.accent,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.md },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fieldGroup: { minWidth: '45%', flex: 1, marginBottom: space.sm },
  fieldLabel: { fontSize: fontSize.xs, color: colors.muted, marginBottom: 4 },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.sm, paddingVertical: space.xs,
    color: colors.text, fontSize: fontSize.sm, height: 36,
  },
  lineHeader: { flexDirection: 'row', gap: space.xs, marginBottom: 4 },
  lineHeaderText: { fontSize: fontSize.xs, color: colors.subtle },
  lineRow: { flexDirection: 'row', gap: space.xs, marginBottom: space.xs, alignItems: 'center' },
  removeBtn: { width: 30, alignItems: 'center' },
  removeBtnText: { fontSize: 22, color: colors.danger, lineHeight: 28 },
  totalsBox: { marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  totalsLabel: { fontSize: fontSize.sm, color: colors.muted },
  totalsVal: { fontSize: fontSize.sm, fontFamily: 'monospace', color: colors.text },
  addItemBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.xs,
  },
  addItemBtnText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.sm },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: space.md, alignItems: 'center', marginTop: space.lg,
  },
  submitBtnText: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.md },

  // Detail
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.borderStrong,
    shadowColor: colors.accent,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  amountLarge: { fontSize: 28, fontWeight: '800', fontFamily: 'monospace' },
  lineItemRow: { marginBottom: space.sm },
  lineItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.sm, marginBottom: space.sm },
  lineDesc: { fontSize: fontSize.sm, color: colors.text, marginBottom: 2 },
  lineTotal: { fontSize: fontSize.sm, fontWeight: '700', fontFamily: 'monospace', color: colors.accent },

  // Shared
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldKey: { fontSize: fontSize.xs, color: colors.subtle },
  fieldVal: { fontSize: fontSize.sm, color: colors.text, fontFamily: 'monospace', marginTop: 1 },
  fieldMuted: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
});
