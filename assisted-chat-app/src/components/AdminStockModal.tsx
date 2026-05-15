import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import {
  useAdminStock,
  type StockItem,
  type StockSeason,
  type SortOption,
  type AddStockForm,
  type EditStockForm,
} from '@/hooks/useAdminStock';

// ── Constants ─────────────────────────────────────────────────────────────

const SEASON_OPTS: { value: StockSeason; label: string }[] = [
  { value: 'allseason', label: 'All-Season' },
  { value: 'summer', label: 'Summer' },
  { value: 'winter', label: 'Winter' },
];

const SORT_OPTS: { value: SortOption; label: string }[] = [
  { value: 'size', label: 'Size' },
  { value: 'stock', label: 'Stock ↓' },
  { value: 'price', label: 'Price ↑' },
  { value: 'type', label: 'Type' },
  { value: 'season_type', label: 'Season' },
];

const WIDTH_OPTS = ['', '155', '165', '175', '185', '195', '205', '215', '225', '235', '245', '255', '265', '275', '285'];
const RIM_OPTS = ['', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

const SEASON_COLOR: Record<StockSeason, string> = {
  allseason: '#3B82F6',
  summer: '#F97316',
  winter: '#93C5FD',
};
const SEASON_BG: Record<StockSeason, string> = {
  allseason: 'rgba(59,130,246,0.15)',
  summer: 'rgba(249,115,22,0.15)',
  winter: 'rgba(147,197,253,0.1)',
};

// ── CSV template & parser ────────────────────────────────────────────────

const TEMPLATE_CSV =
  `size,brand,pattern,season,price,stock
205/55/R16,Michelin,Primacy 4,summer,89.99,10
195/65/R15,Continental,EcoContact 6,allseason,75.00,5
225/45/R17,Bridgestone,Turanza T005,summer,119.99,4`;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += c; }
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^"|"$/g, ''));
}

function parseCsv(text: string): { headers: string[]; data: Record<string, string>[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], data: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const data = lines.slice(1).map((l) => {
    const vals = splitCsvLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, data };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtPrice(p: number | null): string {
  if (p == null) return '—';
  return `£${p.toFixed(2)}`;
}

function seasonLabel(s: StockSeason): string {
  return SEASON_OPTS.find((o) => o.value === s)?.label ?? s;
}

// ── Shared atoms ─────────────────────────────────────────────────────────

function SeasonBadge({ season }: { season: StockSeason }) {
  return (
    <View style={[s.badge, { backgroundColor: SEASON_BG[season] ?? 'transparent' }]}>
      <Text style={[s.badgeText, { color: SEASON_COLOR[season] ?? colors.muted }]}>{seasonLabel(season)}</Text>
    </View>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <View style={[s.badge, { backgroundColor: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}>
      <Text style={[s.badgeText, { color: active ? '#22C55E' : '#EF4444' }]}>{active ? 'Active' : 'Inactive'}</Text>
    </View>
  );
}

function SegButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.segBtn, active && s.segBtnActive]}>
      <Text style={[s.segBtnText, active && s.segBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Stats panel ───────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: { total: number; active: number; inactive: number; totalStock: number } }) {
  return (
    <View style={s.statsRow}>
      <View style={s.statBox}>
        <Text style={s.statVal}>{stats.total}</Text>
        <Text style={s.statKey}>Products</Text>
      </View>
      <View style={s.statBox}>
        <Text style={[s.statVal, { color: '#22C55E' }]}>{stats.active}</Text>
        <Text style={s.statKey}>Active</Text>
      </View>
      <View style={s.statBox}>
        <Text style={[s.statVal, { color: '#EF4444' }]}>{stats.inactive}</Text>
        <Text style={s.statKey}>Inactive</Text>
      </View>
      <View style={s.statBox}>
        <Text style={[s.statVal, { color: colors.accent }]}>{stats.totalStock}</Text>
        <Text style={s.statKey}>Units</Text>
      </View>
    </View>
  );
}

// ── Add size form ─────────────────────────────────────────────────────────

interface AddFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  doAdd: (form: AddStockForm) => Promise<string | null>;
  loading: boolean;
}

function AddSizeForm({ onSuccess, onCancel, doAdd, loading }: AddFormProps) {
  const [form, setForm] = useState<AddStockForm>({
    sizeDisplay: '',
    brand: 'Budget',
    pattern: 'All-Season',
    season: 'allseason',
    stockNew: '0',
    priceNew: '',
  });
  const [error, setError] = useState('');

  const upd = (k: keyof AddStockForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit() {
    setError('');
    const err = await doAdd(form);
    if (err) { setError(err); return; }
    onSuccess();
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>Add Size</Text>
        <Pressable onPress={onCancel} style={s.closeBtn}><Text style={s.closeBtnText}>✕</Text></Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <FieldRow label="Size *">
            <TextInput
              style={s.input}
              value={form.sizeDisplay}
              onChangeText={upd('sizeDisplay')}
              placeholder="205/55/R16"
              placeholderTextColor={colors.subtle}
              autoCapitalize="characters"
            />
          </FieldRow>
          <FieldRow label="Brand">
            <TextInput style={s.input} value={form.brand} onChangeText={upd('brand')} placeholderTextColor={colors.subtle} />
          </FieldRow>
          <FieldRow label="Pattern">
            <TextInput style={s.input} value={form.pattern} onChangeText={upd('pattern')} placeholderTextColor={colors.subtle} />
          </FieldRow>
          <FieldRow label="Season">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {SEASON_OPTS.map((opt) => (
                <SegButton
                  key={opt.value}
                  label={opt.label}
                  active={form.season === opt.value}
                  onPress={() => setForm((p) => ({ ...p, season: opt.value }))}
                />
              ))}
            </View>
          </FieldRow>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <FieldRow label="Initial Stock">
                <TextInput
                  style={s.input}
                  value={form.stockNew}
                  onChangeText={upd('stockNew')}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.subtle}
                />
              </FieldRow>
            </View>
            <View style={{ flex: 1 }}>
              <FieldRow label="Price (£)">
                <TextInput
                  style={s.input}
                  value={form.priceNew}
                  onChangeText={upd('priceNew')}
                  keyboardType="numeric"
                  placeholder="optional"
                  placeholderTextColor={colors.subtle}
                />
              </FieldRow>
            </View>
          </View>
        </View>
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        <Pressable onPress={handleSubmit} disabled={loading} style={[s.submitBtn, loading && { opacity: 0.6 }]}>
          {loading
            ? <ActivityIndicator color={colors.accentText} />
            : <Text style={s.submitBtnText}>Add to Stock</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Inline edit form ──────────────────────────────────────────────────────

interface EditFormProps {
  item: StockItem;
  onSave: (form: EditStockForm) => Promise<string | null>;
  onCancel: () => void;
  loading: boolean;
}

function EditForm({ item, onSave, onCancel, loading }: EditFormProps) {
  const [form, setForm] = useState<EditStockForm>({
    brand: item.brand,
    sizeDisplay: item.sizeDisplay,
    season: item.season,
    priceNew: item.priceNew != null ? String(item.priceNew) : '',
    stockNew: String(item.stockNew),
    stockOrdered: String(item.stockOrdered),
    availableNew: item.availableNew,
    isLocalStock: item.isLocalStock,
  });
  const [error, setError] = useState('');

  const upd = (k: keyof EditStockForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    setError('');
    const err = await onSave(form);
    if (err) setError(err);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.formHeader}>
        <Text style={s.formTitle}>{item.sizeDisplay}</Text>
        <Pressable onPress={onCancel} style={s.closeBtn}><Text style={s.closeBtnText}>✕</Text></Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <FieldRow label="Brand">
            <TextInput style={s.input} value={form.brand} onChangeText={upd('brand')} placeholderTextColor={colors.subtle} />
          </FieldRow>
          <FieldRow label="Size">
            <TextInput
              style={s.input}
              value={form.sizeDisplay}
              onChangeText={upd('sizeDisplay')}
              placeholder="205/55/R16"
              placeholderTextColor={colors.subtle}
              autoCapitalize="characters"
            />
          </FieldRow>
          <FieldRow label="Season">
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {SEASON_OPTS.map((opt) => (
                <SegButton
                  key={opt.value}
                  label={opt.label}
                  active={form.season === opt.value}
                  onPress={() => setForm((p) => ({ ...p, season: opt.value }))}
                />
              ))}
            </View>
          </FieldRow>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <FieldRow label="Price (£)">
                <TextInput style={s.input} value={form.priceNew} onChangeText={upd('priceNew')} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.subtle} />
              </FieldRow>
            </View>
            <View style={{ flex: 1 }}>
              <FieldRow label="Stock">
                <TextInput style={s.input} value={form.stockNew} onChangeText={upd('stockNew')} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.subtle} />
              </FieldRow>
            </View>
            <View style={{ flex: 1 }}>
              <FieldRow label="Ordered">
                <TextInput style={s.input} value={form.stockOrdered} onChangeText={upd('stockOrdered')} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.subtle} />
              </FieldRow>
            </View>
          </View>
          <FieldRow label="Available">
            <Switch
              value={form.availableNew}
              onValueChange={(v) => setForm((p) => ({ ...p, availableNew: v }))}
              trackColor={{ false: colors.dangerBg, true: 'rgba(34,197,94,0.3)' }}
              thumbColor={form.availableNew ? '#22C55E' : '#EF4444'}
            />
          </FieldRow>
          <FieldRow label="Local Stock">
            <Switch
              value={form.isLocalStock}
              onValueChange={(v) => setForm((p) => ({ ...p, isLocalStock: v }))}
              trackColor={{ false: colors.border, true: `${colors.accent}44` }}
              thumbColor={form.isLocalStock ? colors.accent : colors.muted}
            />
          </FieldRow>
        </View>
        {error ? <Text style={s.errorText}>{error}</Text> : null}
        <Pressable onPress={handleSave} disabled={loading} style={[s.submitBtn, loading && { opacity: 0.6 }]}>
          {loading
            ? <ActivityIndicator color={colors.accentText} />
            : <Text style={s.submitBtnText}>Save Changes</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Stock row card ────────────────────────────────────────────────────────

interface StockCardProps {
  item: StockItem;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  actionLoading: string | null;
}

function StockCard({ item, onEdit, onToggle, onDelete, actionLoading }: StockCardProps) {
  const [expanded, setExpanded] = useState(false);
  const busy = actionLoading === item.id;

  return (
    <View style={[s.stockCard, !item.availableNew && s.stockCardInactive]}>
      <Pressable onPress={() => setExpanded((x) => !x)} style={s.stockCardTop}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
            <Text style={s.sizeText}>{item.sizeDisplay}</Text>
            <SeasonBadge season={item.season} />
          </View>
          <Text style={s.brandText} numberOfLines={1}>{item.brand}{item.pattern ? ` · ${item.pattern}` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={[s.priceText, { color: item.availableNew ? colors.accent : colors.muted }]}>
            {fmtPrice(item.priceNew)}
          </Text>
          <StatusBadge active={item.availableNew} />
          <Text style={[s.expandArrow, { color: expanded ? colors.accent : colors.subtle }]}>
            {expanded ? '▴' : '▾'}
          </Text>
        </View>
      </Pressable>

      {/* Stock row */}
      <View style={s.stockRow}>
        <View style={s.stockStat}>
          <Text style={s.stockStatVal}>{item.stockNew}</Text>
          <Text style={s.stockStatKey}>In Stock</Text>
        </View>
        {item.stockOrdered > 0 && (
          <View style={s.stockStat}>
            <Text style={[s.stockStatVal, { color: colors.warning }]}>{item.stockOrdered}</Text>
            <Text style={s.stockStatKey}>Ordered</Text>
          </View>
        )}
        {item.isLocalStock && (
          <View style={[s.badge, { backgroundColor: 'rgba(147,197,253,0.1)' }]}>
            <Text style={[s.badgeText, { color: colors.info }]}>Local</Text>
          </View>
        )}
        {item.featured && (
          <View style={[s.badge, { backgroundColor: `${colors.accent}22` }]}>
            <Text style={[s.badgeText, { color: colors.accent }]}>Featured</Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={s.stockCardActions}>
          <Pressable onPress={onEdit} style={[s.actionBtn, { borderColor: colors.accent }]}>
            <Text style={[s.actionBtnText, { color: colors.accent }]}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={onToggle}
            disabled={busy}
            style={[s.actionBtn, { borderColor: item.availableNew ? '#EF4444' : '#22C55E' }]}
          >
            {busy
              ? <ActivityIndicator size="small" color={item.availableNew ? '#EF4444' : '#22C55E'} />
              : <Text style={[s.actionBtnText, { color: item.availableNew ? '#EF4444' : '#22C55E' }]}>
                  {item.availableNew ? 'Deactivate' : 'Activate'}
                </Text>}
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(
                'Remove Product',
                `Remove ${item.sizeDisplay} (${item.brand}) from stock?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: onDelete },
                ],
              );
            }}
            disabled={busy}
            style={[s.actionBtn, { borderColor: colors.danger }]}
          >
            <Text style={[s.actionBtnText, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Filter / Sort bar ─────────────────────────────────────────────────────

interface FilterBarProps {
  filterWidth: string;
  filterRim: string;
  filterAvailable: string;
  sort: SortOption;
  onApplyFilters: (w: string, r: string, avail: string) => void;
  onApplySort: (s: SortOption) => void;
}

function FilterBar({ filterWidth, filterRim, filterAvailable, sort, onApplyFilters, onApplySort }: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [localWidth, setLocalWidth] = useState(filterWidth);
  const [localRim, setLocalRim] = useState(filterRim);
  const [localAvail, setLocalAvail] = useState(filterAvailable);

  function apply() {
    onApplyFilters(localWidth, localRim, localAvail);
    setShowFilters(false);
  }
  function clear() {
    setLocalWidth(''); setLocalRim(''); setLocalAvail('');
    onApplyFilters('', '', '');
    setShowFilters(false);
  }

  const hasFilters = filterWidth || filterRim || filterAvailable;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortBar}>
        <Pressable
          onPress={() => setShowFilters((x) => !x)}
          style={[s.filterToggleBtn, hasFilters && { borderColor: colors.accent }]}
        >
          <Text style={[s.filterToggleBtnText, hasFilters && { color: colors.accent }]}>
            {hasFilters ? '⚙ Filters •' : '⚙ Filters'}
          </Text>
        </Pressable>
        {SORT_OPTS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onApplySort(opt.value)}
            style={[s.sortBtn, sort === opt.value && s.sortBtnActive]}
          >
            <Text style={[s.sortBtnText, sort === opt.value && { color: colors.accent }]}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {showFilters && (
        <View style={s.filterPanel}>
          <Text style={s.filterPanelTitle}>Filters</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {/* Width */}
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={s.fieldLabel}>Width (mm)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
                {WIDTH_OPTS.map((w) => (
                  <Pressable key={w} onPress={() => setLocalWidth(w)} style={[s.dimBtn, localWidth === w && s.dimBtnActive]}>
                    <Text style={[s.dimBtnText, localWidth === w && { color: colors.accent }]}>{w || 'All'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {/* Rim */}
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={s.fieldLabel}>Rim (″)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
                {RIM_OPTS.map((r) => (
                  <Pressable key={r} onPress={() => setLocalRim(r)} style={[s.dimBtn, localRim === r && s.dimBtnActive]}>
                    <Text style={[s.dimBtnText, localRim === r && { color: colors.accent }]}>{r || 'All'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
          {/* Status */}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            {[
              { v: '', l: 'All' },
              { v: 'true', l: 'Active' },
              { v: 'false', l: 'Inactive' },
            ].map((opt) => (
              <Pressable key={opt.v} onPress={() => setLocalAvail(opt.v)} style={[s.dimBtn, localAvail === opt.v && s.dimBtnActive]}>
                <Text style={[s.dimBtnText, localAvail === opt.v && { color: colors.accent }]}>{opt.l}</Text>
              </Pressable>
            ))}
          </View>
          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Pressable onPress={apply} style={[s.submitBtn, { flex: 1, paddingVertical: space.xs }]}>
              <Text style={s.submitBtnText}>Apply</Text>
            </Pressable>
            <Pressable onPress={clear} style={[s.actionBtn, { flex: 1, borderColor: colors.border, justifyContent: 'center' }]}>
              <Text style={[s.actionBtnText, { color: colors.muted }]}>Clear</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Bulk Import Screen ────────────────────────────────────────────────────

interface BulkRow {
  _row: number;
  size: string;
  brand: string;
  pattern: string;
  season: string;
  price: string;
  stock: string;
  valid: boolean;
  error?: string;
}

interface BulkResult {
  imported: number;
  updated: number;
  errors: { row: number; message: string }[];
  total: number;
}

const BULK_SIZE_RE = /^\d{3}\/\d{2,3}\/[Rr]\d{2}$/;

function BulkImportScreen({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const [step, setStep] = useState<'pick' | 'preview' | 'importing' | 'done'>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [upsert, setUpsert] = useState(true);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [err, setErr] = useState('');

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  async function pickFile() {
    setErr('');
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFileName(asset.name);
      const resp = await fetch(asset.uri);
      const text = await resp.text();
      const { data } = parseCsv(text);
      if (!data.length) { setErr('CSV is empty or has no data rows.'); return; }
      const mapped: BulkRow[] = data.map((r, i) => {
        const raw = (r.size || r['tyre size'] || r['tyre_size'] || '').trim();
        const sz = raw.toUpperCase().replace(/\s/g, '');
        const valid = BULK_SIZE_RE.test(sz);
        return {
          _row: i + 2,
          size: valid ? sz : raw,
          brand: (r.brand || '').trim(),
          pattern: (r.pattern || '').trim(),
          season: (r.season || 'summer').trim().toLowerCase(),
          price: (r.price || '').trim(),
          stock: (r.stock || '0').trim(),
          valid,
          error: valid ? undefined : `Row ${i + 2}: Invalid size "${raw || '(blank)'}"`,
        };
      });
      setRows(mapped);
      setStep('preview');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to read file.');
    }
  }

  async function doImport() {
    setStep('importing');
    setErr('');
    try {
      const payload = validRows.map((r) => ({
        size: r.size,
        brand: r.brand || undefined,
        pattern: r.pattern || undefined,
        season: r.season || 'summer',
        price: r.price ? parseFloat(r.price) : null,
        stock: parseInt(r.stock || '0', 10) || 0,
      }));
      const data = await api.post<BulkResult>('/api/mobile/admin/stock/bulk', {
        rows: payload,
        mode: upsert ? 'upsert' : 'insert',
      });
      setResult(data);
      setStep('done');
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
      setStep('preview');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={s.formHeader}>
        <Pressable onPress={onBack} style={s.closeBtn}>
          <Text style={s.closeBtnText}>←</Text>
        </Pressable>
        <Text style={s.formTitle}>Bulk Import</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">

        {/* ── Pick ── */}
        {step === 'pick' && (
          <>
            <View style={s.card}>
              <Text style={[s.fieldLabel, { fontWeight: '700', color: colors.text, marginBottom: space.sm }]}>CSV Format</Text>
              <Text style={{ fontFamily: 'monospace', fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 }}>
                {TEMPLATE_CSV}
              </Text>
              <Pressable
                onPress={() => void Clipboard.setStringAsync(TEMPLATE_CSV)}
                style={[s.actionBtn, { borderColor: colors.border, alignSelf: 'flex-start', marginTop: space.sm }]}
              >
                <Text style={[s.actionBtnText, { color: colors.muted }]}>Copy Template</Text>
              </Pressable>
            </View>

            <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, paddingRight: space.sm }}>
                <Text style={[s.fieldLabel, { color: colors.text }]}>Update existing sizes</Text>
                <Text style={[s.fieldLabel, { fontSize: 11 }]}>Overwrites price & stock if size already exists</Text>
              </View>
              <Switch
                value={upsert}
                onValueChange={setUpsert}
                trackColor={{ false: colors.border, true: `${colors.accent}44` }}
                thumbColor={upsert ? colors.accent : colors.muted}
              />
            </View>

            {err ? <Text style={[s.errorText, { marginBottom: space.md }]}>{err}</Text> : null}

            <Pressable onPress={pickFile} style={s.submitBtn}>
              <Text style={s.submitBtnText}>📂  Pick CSV File</Text>
            </Pressable>
          </>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && (
          <>
            <View style={s.card}>
              <Text style={[s.fieldLabel, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>{fileName}</Text>
              <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xs }}>
                <Text style={{ color: '#22C55E', fontSize: fontSize.sm, fontWeight: '700' }}>✓ {validRows.length} valid</Text>
                {invalidRows.length > 0 && (
                  <Text style={{ color: colors.danger, fontSize: fontSize.sm, fontWeight: '700' }}>✗ {invalidRows.length} invalid</Text>
                )}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.filterPanelTitle}>Preview (first 5)</Text>
              {validRows.slice(0, 5).map((r, i) => (
                <View key={i} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: fontSize.xs, fontFamily: 'monospace' }}>
                    {r.size}  {r.brand || '—'}  {r.season}  {r.price ? `£${r.price}` : '—'}  ×{r.stock}
                  </Text>
                </View>
              ))}
              {validRows.length > 5 && (
                <Text style={[s.fieldLabel, { marginTop: 4 }]}>…and {validRows.length - 5} more rows</Text>
              )}
            </View>

            {invalidRows.length > 0 && (
              <View style={[s.card, { borderColor: colors.dangerBorder }]}>
                <Text style={[s.filterPanelTitle, { color: colors.danger, marginBottom: space.sm }]}>Invalid rows (will be skipped)</Text>
                {invalidRows.map((r) => (
                  <Text key={r._row} style={{ color: colors.danger, fontSize: fontSize.xs, marginBottom: 2 }}>{r.error}</Text>
                ))}
              </View>
            )}

            {err ? <Text style={[s.errorText, { marginBottom: space.md }]}>{err}</Text> : null}

            <Pressable onPress={doImport} disabled={!validRows.length} style={[s.submitBtn, !validRows.length && { opacity: 0.4 }]}>
              <Text style={s.submitBtnText}>Import {validRows.length} rows</Text>
            </Pressable>
            <Pressable
              onPress={() => { setStep('pick'); setRows([]); setErr(''); }}
              style={[s.actionBtn, { borderColor: colors.border, alignItems: 'center', marginTop: space.sm }]}
            >
              <Text style={[s.actionBtnText, { color: colors.muted }]}>Pick different file</Text>
            </Pressable>
          </>
        )}

        {/* ── Importing ── */}
        {step === 'importing' && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: space.md }}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[s.fieldLabel, { color: colors.muted }]}>Importing {validRows.length} rows…</Text>
          </View>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <>
            <View style={[s.card, { borderColor: colors.successBorder }]}>
              <Text style={[s.filterPanelTitle, { color: colors.success, marginBottom: space.sm }]}>Import Complete</Text>
              <Text style={{ color: '#22C55E', fontSize: fontSize.md, fontWeight: '700', marginBottom: 4 }}>
                ✓ {result.imported} new {result.imported === 1 ? 'row' : 'rows'} imported
              </Text>
              {result.updated > 0 && (
                <Text style={{ color: colors.info, fontSize: fontSize.md, fontWeight: '700', marginBottom: 4 }}>
                  ↻ {result.updated} {result.updated === 1 ? 'row' : 'rows'} updated
                </Text>
              )}
              {result.errors.length > 0 && (
                <Text style={{ color: colors.danger, fontSize: fontSize.md, fontWeight: '700' }}>
                  ✗ {result.errors.length} {result.errors.length === 1 ? 'error' : 'errors'}
                </Text>
              )}
            </View>

            {result.errors.length > 0 && (
              <View style={[s.card, { borderColor: colors.dangerBorder }]}>
                <Text style={[s.filterPanelTitle, { color: colors.danger, marginBottom: space.sm }]}>Errors</Text>
                {result.errors.map((e, i) => (
                  <Text key={i} style={{ color: colors.danger, fontSize: fontSize.xs, marginBottom: 2 }}>
                    Row {e.row}: {e.message}
                  </Text>
                ))}
              </View>
            )}

            <Pressable onPress={onBack} style={s.submitBtn}>
              <Text style={s.submitBtnText}>Done</Text>
            </Pressable>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────

type Screen = 'list' | 'add' | 'edit' | 'bulk';

interface Props { visible: boolean; onClose: () => void; }

export function AdminStockModal({ visible, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('list');
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const {
    items, stats, totalCount, totalPages, page,
    search, filterWidth, filterRim, filterAvailable, sort,
    loading, error, actionLoading, toast,
    refresh, applySearch, applyFilters, applySort, goPage,
    doAdd, doUpdate, doToggleAvailable, doDelete,
  } = useAdminStock(visible);

  function openEdit(item: StockItem) {
    setEditItem(item);
    setScreen('edit');
  }

  async function handleUpdate(form: EditStockForm) {
    if (!editItem) return null;
    const err = await doUpdate(editItem.id, form);
    if (!err) setScreen('list');
    return err;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (screen !== 'list') setScreen('list');
        else onClose();
      }}
    >
      <SafeAreaView style={s.root}>

        {/* ── List ── */}
        {screen === 'list' && (
          <>
            {/* Header */}
            <View style={s.header}>
              <View>
                <Text style={s.title}>Stock</Text>
                <Text style={s.subtitle}>{totalCount} products</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Pressable onPress={() => setScreen('add')} style={s.newBtn}>
                  <Text style={s.newBtnText}>+ Add</Text>
                </Pressable>
                <Pressable onPress={() => setScreen('bulk')} style={[s.newBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[s.newBtnText, { color: colors.muted }]}>↑ CSV</Text>
                </Pressable>
                <Pressable onPress={refresh} disabled={loading} style={s.iconBtn}>
                  <Text style={s.iconBtnText}>{loading ? '…' : '↺'}</Text>
                </Pressable>
                <Pressable onPress={onClose} style={s.iconBtn}>
                  <Text style={s.iconBtnText}>✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Toast */}
            {toast && (
              <View style={[s.toast, {
                backgroundColor: toast.ok ? colors.successBg : colors.dangerBg,
                borderColor: toast.ok ? colors.successBorder : colors.dangerBorder,
              }]}>
                <Text style={[s.toastText, { color: toast.ok ? colors.success : colors.danger }]}>{toast.text}</Text>
              </View>
            )}

            {/* Stats */}
            <StatsPanel stats={stats} />

            {/* Search */}
            <View style={s.searchRow}>
              <TextInput
                style={s.searchInput}
                placeholder="Search brand, pattern, size…"
                placeholderTextColor={colors.subtle}
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={() => applySearch(searchInput)}
                returnKeyType="search"
              />
              <Pressable onPress={() => applySearch(searchInput)} style={s.searchBtn}>
                <Text style={s.searchBtnText}>Go</Text>
              </Pressable>
              {search ? (
                <Pressable onPress={() => { setSearchInput(''); applySearch(''); }} style={s.clearSearchBtn}>
                  <Text style={s.clearSearchBtnText}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Filters + Sort */}
            <FilterBar
              filterWidth={filterWidth}
              filterRim={filterRim}
              filterAvailable={filterAvailable}
              sort={sort}
              onApplyFilters={applyFilters}
              onApplySort={applySort}
            />

            {/* List */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent}>
              {error && <Text style={s.errorText}>{error}</Text>}
              {loading && items.length === 0
                ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
                : items.length === 0
                ? <Text style={s.emptyText}>No products found</Text>
                : items.map((item) => (
                    <StockCard
                      key={item.id}
                      item={item}
                      onEdit={() => openEdit(item)}
                      onToggle={() => void doToggleAvailable(item)}
                      onDelete={() => void doDelete(item.id)}
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

        {/* ── Add Size ── */}
        {screen === 'add' && (
          <AddSizeForm
            onSuccess={() => setScreen('list')}
            onCancel={() => setScreen('list')}
            doAdd={doAdd}
            loading={actionLoading === 'add'}
          />
        )}

        {/* ── Edit ── */}
        {screen === 'edit' && editItem && (
          <EditForm
            item={editItem}
            onSave={handleUpdate}
            onCancel={() => setScreen('list')}
            loading={actionLoading === editItem.id}
          />
        )}

        {/* ── Bulk Import ── */}
        {screen === 'bulk' && (
          <BulkImportScreen
            onBack={() => setScreen('list')}
            onRefresh={refresh}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

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

  statsRow: {
    flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: space.xs,
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: space.xs, backgroundColor: colors.surface, borderRadius: radius.sm },
  statVal: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, fontFamily: 'monospace' },
  statKey: { fontSize: 10, color: colors.subtle, marginTop: 1 },

  searchRow: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm },
  searchInput: {
    flex: 1, height: 36, backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, color: colors.text, fontSize: fontSize.sm,
  },
  searchBtn: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    backgroundColor: colors.accent, borderRadius: radius.md, justifyContent: 'center',
  },
  searchBtnText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.sm },
  clearSearchBtn: { padding: space.sm, justifyContent: 'center' },
  clearSearchBtnText: { color: colors.muted, fontSize: fontSize.md },

  sortBar: { flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.xs },
  filterToggleBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  filterToggleBtnText: { fontSize: fontSize.xs, color: colors.muted, fontWeight: '600' },
  sortBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  sortBtnActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  sortBtnText: { fontSize: fontSize.xs, color: colors.muted },

  filterPanel: {
    marginHorizontal: space.md, padding: space.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm,
  },
  filterPanelTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm },
  dimBtn: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  dimBtnActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  dimBtnText: { fontSize: fontSize.xs, color: colors.muted },

  listContent: { padding: space.md, paddingBottom: 40 },
  emptyText: { color: colors.subtle, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.lg },

  stockCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: space.sm, overflow: 'hidden',
  },
  stockCardInactive: { opacity: 0.7 },
  stockCardTop: { padding: space.md, flexDirection: 'row', gap: space.sm },
  sizeText: { fontSize: fontSize.md, fontWeight: '800', color: colors.text, fontFamily: 'monospace' },
  brandText: { fontSize: fontSize.xs, color: colors.muted },
  priceText: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'monospace' },
  expandArrow: { fontSize: fontSize.xs, marginTop: 2 },

  stockRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.md, paddingBottom: space.sm, flexWrap: 'wrap',
  },
  stockStat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  stockStatVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, fontFamily: 'monospace' },
  stockStatKey: { fontSize: 10, color: colors.subtle },

  stockCardActions: {
    borderTopWidth: 1, borderTopColor: colors.border,
    padding: space.md, flexDirection: 'row', gap: space.sm, flexWrap: 'wrap',
  },
  actionBtn: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    borderRadius: radius.sm, borderWidth: 1, minWidth: 80, alignItems: 'center', justifyContent: 'center', height: 32,
  },
  actionBtnText: { fontSize: fontSize.xs, fontWeight: '600' },

  badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, marginTop: space.md },
  pageBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: fontSize.sm, color: colors.muted },
  pageInfo: { fontSize: fontSize.sm, color: colors.subtle, fontFamily: 'monospace' },

  // Forms
  formHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  formTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  closeBtn: { padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  closeBtnText: { fontSize: fontSize.md, color: colors.muted },
  formBody: { padding: space.md, paddingBottom: 80 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md,
    marginBottom: space.md, borderWidth: 1, borderColor: colors.border,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border, gap: space.sm,
    minHeight: 44,
  },
  fieldLabel: { fontSize: fontSize.sm, color: colors.muted, flex: 1 },
  input: {
    flex: 1, height: 34, backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.sm, color: colors.text, fontSize: fontSize.sm,
    textAlign: 'right',
  },
  segBtn: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  segBtnActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}22` },
  segBtnText: { fontSize: fontSize.xs, color: colors.muted },
  segBtnTextActive: { color: colors.accent, fontWeight: '700' },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: space.md, alignItems: 'center', marginTop: space.md,
  },
  submitBtnText: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.md },
});
