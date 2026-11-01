import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';
import {
  parseAdminCustomer, parseAdminCustomerDetail, parseAdminCustomerList,
  parseCustomerActionResult, parseCustomerMailResult,
  type AdminCustomer, type AdminCustomerDetail, type AdminCustomerList,
  type AdminCustomerUpdate, type CustomerVerification, type CustomerStatusFilter, type CustomerAccountAction, type CustomerActionResult,
} from '@/types/admin-customers';

interface Query {
  search: string;
  verification: CustomerVerification;
  status?: CustomerStatusFilter;
  page: number;
  customerId: string | null;
}

interface Feed<T> { key: string; data: T | null; loading: boolean; error: string | null }

export function useAdminCustomers({ search, verification, status = 'all', page, customerId }: Query) {
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const scopeKey = `${apiRevision}:${sessionRevision}`;
  const listKey = `${scopeKey}:${verification}:${status}:${page}:${search}`;
  const detailKey = `${scopeKey}:${customerId ?? ''}`;
  const mounted = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const accountScope = useMemo(() => ({ customerId, scopeKey }), [customerId, scopeKey]);
  const selectedCustomer = useRef(accountScope);
  const [listFeed, setListFeed] = useState<Feed<AdminCustomerList> | null>(null);
  const [detailFeed, setDetailFeed] = useState<Feed<AdminCustomerDetail> | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = useCallback(() => mounted.current && api.hasAdminToken
    && getApiContextRevision() === apiRevision && getAdminSessionRevision() === sessionRevision,
  [apiRevision, sessionRevision]);
  const currentCustomer = useCallback(() => current() && selectedCustomer.current === accountScope && customerId !== null, [accountScope, current, customerId]);

  useLayoutEffect(() => {
    selectedCustomer.current = accountScope;
    mutation.current?.abort();
    mutation.current = null;
  }, [accountScope]);

  useEffect(() => { setSaveBusy(false); setSaveError(null); }, [accountScope]);

  useEffect(() => {
    mounted.current = true;
    const pending = controllers.current;
    return () => {
      mounted.current = false;
      pending.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, [scopeKey]);

  const refreshList = useCallback(async () => {
    if (!current()) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    controllers.current.add(controller);
    setListFeed((previous) => ({ key: listKey, data: previous?.key === listKey ? previous.data : null, loading: true, error: null }));
    try {
      const query = new URLSearchParams({ search, verification, status, page: String(page), perPage: '25' });
      const response = await api.get<unknown>(`/api/mobile/admin/customers?${query}`, { signal: controller.signal });
      if (!current() || controller.signal.aborted) return;
      setListFeed({ key: listKey, data: parseAdminCustomerList(response), loading: false, error: null });
    } catch (error) {
      if (!current() || controller.signal.aborted) return;
      setListFeed((previous) => ({ key: listKey, data: previous?.key === listKey ? previous.data : null, loading: false, error: error instanceof Error ? error.message : 'Could not load customers. Please retry.' }));
    } finally { controllers.current.delete(controller); }
  }, [current, listKey, page, search, status, verification]);

  useEffect(() => {
    void refreshList();
    return () => { listRequest.current?.abort(); };
  }, [refreshList]);

  const refreshDetail = useCallback(async () => {
    if (!customerId || !current() || mutation.current) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    controllers.current.add(controller);
    setDetailFeed({ key: detailKey, data: null, loading: true, error: null });
    setSaveError(null);
    try {
      const response = await api.get<unknown>(`/api/mobile/admin/customers/${encodeURIComponent(customerId)}`, { signal: controller.signal });
      if (!current() || controller.signal.aborted) return;
      const data = parseAdminCustomerDetail(response);
      if (data.customer.id !== customerId) throw new Error('The customer response did not match this account. Please retry.');
      setDetailFeed({ key: detailKey, data, loading: false, error: null });
    } catch (error) {
      if (!current() || controller.signal.aborted) return;
      setDetailFeed({ key: detailKey, data: null, loading: false, error: error instanceof Error ? error.message : 'Could not load this customer. Please retry.' });
    } finally { controllers.current.delete(controller); }
  }, [current, customerId, detailKey]);

  useEffect(() => {
    void refreshDetail();
    return () => { detailRequest.current?.abort(); };
  }, [refreshDetail]);

  const save = useCallback(async (input: AdminCustomerUpdate): Promise<boolean> => {
    if (!customerId || !currentCustomer() || mutation.current) return false;
    const controller = new AbortController();
    mutation.current = controller;
    controllers.current.add(controller);
    detailRequest.current?.abort();
    setSaveBusy(true);
    setSaveError(null);
    try {
      const response = await api.patch<{ customer: AdminCustomer }>(`/api/mobile/admin/customers/${encodeURIComponent(customerId)}`, input, { signal: controller.signal });
      if (!currentCustomer() || controller.signal.aborted) return false;
      const customer = parseAdminCustomer(response.customer);
      if (customer.id !== customerId) throw new Error('The saved response did not match this account. Reload the customer to check the change.');
      setDetailFeed((previous) => previous?.key === detailKey && previous.data
        ? { ...previous, data: { ...previous.data, customer } } : previous);
      void refreshList();
      return true;
    } catch (error) {
      if (currentCustomer() && !controller.signal.aborted) setSaveError(error instanceof Error ? error.message : 'Could not save customer changes. Please retry.');
      return false;
    } finally {
      controllers.current.delete(controller);
      if (mutation.current === controller) mutation.current = null;
      if (currentCustomer()) setSaveBusy(false);
    }
  }, [currentCustomer, customerId, detailKey, refreshList]);

  const performAction = useCallback(async (input: CustomerAccountAction): Promise<CustomerActionResult | null> => {
    if (!customerId || !currentCustomer() || mutation.current) return null;
    const controller = new AbortController();
    mutation.current = controller;
    controllers.current.add(controller);
    detailRequest.current?.abort();
    setSaveBusy(true);
    setSaveError(null);
    try {
      const endpoint = input.action === 'email_change' ? 'email-change' : input.action === 'password_reset' ? 'password-reset' : 'actions';
      const body = input.action === 'email_change' ? { email: input.email, expectedUpdatedAt: input.expectedUpdatedAt }
        : input.action === 'password_reset' ? { expectedUpdatedAt: input.expectedUpdatedAt } : input;
      const response = await api.post<unknown>(`/api/mobile/admin/customers/${encodeURIComponent(customerId)}/${endpoint}`, body, { signal: controller.signal });
      if (!currentCustomer() || controller.signal.aborted) return null;
      const result = input.action === 'email_change' || input.action === 'password_reset'
        ? parseCustomerMailResult(response, input.action, customerId)
        : parseCustomerActionResult(response, input.action, customerId);
      setDetailFeed((previous) => result.deleted ? null : previous?.key === detailKey && previous.data && result.customer
        ? { ...previous, data: { ...previous.data, customer: result.customer } } : previous);
      if (result.deleted) {
        // The server has confirmed deletion. Keep this result even if the
        // follow-up list refresh is slow or fails, so the old row cannot reopen.
        setListFeed((previous) => {
          if (previous?.key !== listKey || !previous.data?.customers.some((row) => row.id === customerId)) return previous;
          const total = Math.max(0, previous.data.total - 1);
          return { ...previous, data: { ...previous.data,
            customers: previous.data.customers.filter((row) => row.id !== customerId),
            total, totalPages: Math.max(1, Math.ceil(total / previous.data.perPage)),
          } };
        });
      }
      void refreshList();
      return result;
    } catch (error) {
      if (currentCustomer() && !controller.signal.aborted) setSaveError(error instanceof Error ? error.message : 'The account action could not be completed. Please retry.');
      return null;
    } finally {
      controllers.current.delete(controller);
      if (mutation.current === controller) mutation.current = null;
      if (currentCustomer()) setSaveBusy(false);
    }
  }, [currentCustomer, customerId, detailKey, listKey, refreshList]);

  const list = api.hasAdminToken && listFeed?.key === listKey ? listFeed : null;
  const detail = api.hasAdminToken && detailFeed?.key === detailKey ? detailFeed : null;
  return {
    list: list?.data ?? null,
    listLoading: api.hasAdminToken && (list?.loading ?? true),
    listError: list?.error ?? null,
    detail: detail?.data ?? null,
    detailLoading: Boolean(customerId && api.hasAdminToken && (detail?.loading ?? true)),
    detailError: detail?.error ?? null,
    saveBusy, saveError, save, performAction, refreshList, refreshDetail,
    clearSaveError: useCallback(() => setSaveError(null), []),
  };
}
