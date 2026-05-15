import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' | 'archived' | 'cancelled';

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  bookingId: string | null;
  status: InvoiceStatus;
  customerName: string;
  customerEmail: string;
  totalAmount: string;
  subtotal: string;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  sortOrder: number | null;
}

export interface InvoiceDetail extends InvoiceRow {
  customerPhone: string | null;
  customerAddress: string | null;
  companyName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  vatRate: string;
  vatAmount: string;
  notes: string | null;
  internalNotes: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  items: InvoiceItem[];
}

// ── List hook ──────────────────────────────────────────────────────────────

export function useAdminInvoices(enabled: boolean) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const fetch = useCallback(async (pg = page, q = search, st = status) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (q) params.set('search', q);
      if (st !== 'all') params.set('status', st);
      const data = await api.get<{
        items: InvoiceRow[];
        totalCount: number;
        totalPages: number;
        page: number;
      }>(`/api/mobile/admin/invoices?${params}`);
      setInvoices(data.items ?? []);
      setTotal(data.totalCount ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? 1);
      setError(null);
    } catch {
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [enabled, page, search, status]);

  useEffect(() => {
    if (enabled) void fetch(1, search, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status]);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 2500);
  }

  async function doAction(id: string, action: 'send' | 'archive' | 'delete' | 'markPaid') {
    setActionLoading(id);
    try {
      if (action === 'send') {
        await api.post(`/api/mobile/admin/invoices/${id}/send`, {});
        showToast('Invoice sent', true);
      } else if (action === 'archive') {
        await api.post(`/api/mobile/admin/invoices/${id}/archive`, {});
        showToast('Invoice archived', true);
      } else if (action === 'delete') {
        await api.del(`/api/mobile/admin/invoices/${id}`);
        showToast('Invoice deleted', true);
      } else {
        await api.patch(`/api/mobile/admin/invoices/${id}`, { status: 'paid' });
        showToast('Marked as paid', true);
      }
      void fetch(page, search, status);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Action failed', false);
    } finally {
      setActionLoading(null);
    }
  }

  function applySearch(q: string) {
    setSearch(q);
    void fetch(1, q, status);
    setPage(1);
  }

  function applyStatus(s: string) {
    setStatus(s);
    setPage(1);
  }

  function goPage(p: number) {
    setPage(p);
    void fetch(p, search, status);
  }

  return {
    invoices, total, totalPages, page, search, status,
    loading, error, actionLoading, toast,
    refresh: () => fetch(page, search, status),
    applySearch, applyStatus, goPage, doAction,
  };
}

// ── Detail hook ────────────────────────────────────────────────────────────

export function useInvoiceDetail(id: string | null, enabled: boolean) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !enabled) { setDetail(null); return; }
    setLoading(true);
    api.get<{ invoice: Omit<InvoiceDetail, 'items'>; items: InvoiceItem[] }>(
      `/api/mobile/admin/invoices/${id}`
    ).then(({ invoice, items }) => {
      setDetail({ ...invoice, items });
    }).catch(() => {
      setDetail(null);
    }).finally(() => setLoading(false));
  }, [id, enabled]);

  return { detail, loading };
}
