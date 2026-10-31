import { useCallback, useEffect, useRef, useState } from 'react';

import { requestJson } from './api';
import { useCustomerAccount } from './customer-account';

const ENDPOINT = '/api/mobile/customer/addresses';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CUSTOMER_ADDRESS_LIMIT = 20;

export interface CustomerAddressInput {
  label: string;
  addressLine: string;
  lat: number;
  lng: number;
}

export interface CustomerSavedAddress extends CustomerAddressInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export function validateCustomerAddress(input: CustomerAddressInput): string | null {
  if (!input || typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 40) {
    return 'Name this address using 1 to 40 characters.';
  }
  if (typeof input.addressLine !== 'string' || input.addressLine.trim().length < 5 || input.addressLine.trim().length > 500) {
    return 'Choose a complete address using 5 to 500 characters.';
  }
  if (!Number.isFinite(input.lat) || Math.abs(input.lat) > 90 || !Number.isFinite(input.lng) || Math.abs(input.lng) > 180) {
    return 'Choose the address on the map before saving.';
  }
  return null;
}

/** Retry deduplication only. An address identifier never grants access to it. */
export function newCustomerAddressId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function readAddress(value: unknown): CustomerSavedAddress {
  if (!value || typeof value !== 'object') throw new Error('Unable to read your saved addresses. Please refresh.');
  const address = value as CustomerSavedAddress;
  if (!UUID.test(address.id) || validateCustomerAddress(address) || typeof address.createdAt !== 'string'
    || typeof address.updatedAt !== 'string' || !Number.isFinite(Date.parse(address.createdAt)) || !Number.isFinite(Date.parse(address.updatedAt))) {
    throw new Error('Unable to read your saved addresses. Please refresh.');
  }
  return { id: address.id, label: address.label, addressLine: address.addressLine, lat: address.lat, lng: address.lng,
    createdAt: address.createdAt, updatedAt: address.updatedAt };
}

function cancelled() {
  const error = new Error('Your account changed. Open your saved addresses again.');
  error.name = 'AbortError';
  return error;
}

type Snapshot = {
  identity: string | null;
  addresses: CustomerSavedAddress[];
  loading: boolean;
  busy: boolean;
  error: string | null;
};
type Mutation = { identity: string; controller: AbortController };

/** Account-bound data stays in memory. Every request uses the current customer bearer. */
export function useCustomerAddresses() {
  const account = useCustomerAccount();
  const { token, loading: accountLoading, sessionRevision } = account;
  const ownerId = account.profile?.id;
  const identity = token && ownerId && !accountLoading ? JSON.stringify([ownerId, token, sessionRevision]) : null;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const scope = useRef({ mounted: true, getId: 0, getController: null as AbortController | null, mutation: null as Mutation | null });
  const [snapshot, setSnapshot] = useState<Snapshot>({ identity: null, addresses: [], loading: false, busy: false, error: null });

  const refresh = useCallback(async () => {
    const state = scope.current;
    if (!identity || !token || currentIdentity.current !== identity || !state.mounted || state.mutation) return;
    const requestId = ++state.getId;
    state.getController?.abort();
    const controller = new AbortController();
    state.getController = controller;
    const current = () => state.mounted && currentIdentity.current === identity && state.getId === requestId && !controller.signal.aborted;
    setSnapshot(previous => ({ identity, addresses: previous.identity === identity ? previous.addresses : [], loading: true, busy: false, error: null }));
    try {
      const result = await requestJson<{ addresses: unknown[] }>(ENDPOINT, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!current()) return;
      if (!result || !Array.isArray(result.addresses) || result.addresses.length > CUSTOMER_ADDRESS_LIMIT) throw new Error('Unable to read your saved addresses. Please refresh.');
      const addresses = result.addresses.map(readAddress);
      if (new Set(addresses.map(address => address.id)).size !== addresses.length) throw new Error('Unable to read your saved addresses. Please refresh.');
      setSnapshot({ identity, addresses, loading: false, busy: false, error: null });
    } catch (error) {
      if (current()) setSnapshot(previous => ({ ...previous, identity, loading: false, error: error instanceof Error ? error.message : 'Unable to load saved addresses. Please try again.' }));
    } finally {
      if (state.getController === controller) state.getController = null;
    }
  }, [identity, token]);

  useEffect(() => {
    const state = scope.current;
    state.mounted = true;
    setSnapshot({ identity, addresses: [], loading: Boolean(identity), busy: false, error: null });
    void refresh();
    return () => {
      state.mounted = false;
      state.getId++;
      state.getController?.abort();
      state.getController = null;
      state.mutation?.controller.abort();
      state.mutation = null;
    };
  }, [identity, refresh]);

  const mutate = useCallback(async (method: 'POST' | 'PUT' | 'DELETE', id: string, input?: CustomerAddressInput) => {
    const state = scope.current;
    if (!identity || !token || currentIdentity.current !== identity || !state.mounted) throw cancelled();
    if (state.mutation) throw new Error('Please wait for the current address change to finish.');
    if (!UUID.test(id)) throw new Error('This saved address could not be identified. Please refresh.');
    const validation = method !== 'DELETE' ? validateCustomerAddress(input as CustomerAddressInput) : null;
    if (validation) throw new Error(validation);
    const payload = input ? { label: input.label.trim(), addressLine: input.addressLine.trim(), lat: input.lat, lng: input.lng } : null;
    const operation: Mutation = { identity, controller: new AbortController() };
    state.mutation = operation;
    state.getId++;
    state.getController?.abort();
    state.getController = null;
    const current = () => state.mounted && currentIdentity.current === identity && state.mutation === operation && !operation.controller.signal.aborted;
    setSnapshot(previous => ({ identity, addresses: previous.identity === identity ? previous.addresses : [], loading: false, busy: true, error: null }));
    try {
      const result = await requestJson<{ address?: unknown; success?: boolean }>(method === 'POST' ? ENDPOINT : `${ENDPOINT}/${encodeURIComponent(id)}`, {
        method, headers: { Authorization: `Bearer ${token}` }, signal: operation.controller.signal,
        ...(payload ? { body: JSON.stringify(method === 'POST' ? { id, ...payload } : payload) } : {}),
      });
      if (!current()) throw cancelled();
      if (method === 'DELETE') {
        if (result?.success !== true) throw new Error('Deletion was not confirmed. Refresh before trying again.');
        setSnapshot(previous => ({ ...previous, addresses: previous.addresses.filter(address => address.id !== id), error: null }));
        return null;
      }
      const address = readAddress(result?.address);
      if (address.id !== id) throw new Error('The saved address could not be confirmed. Please refresh.');
      setSnapshot(previous => ({ ...previous, addresses: [...previous.addresses.filter(item => item.id !== id), address], error: null }));
      return address;
    } catch (error) {
      if (!current()) throw cancelled();
      setSnapshot(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Unable to change this address. Please try again.' }));
      throw error;
    } finally {
      if (state.mutation === operation) {
        state.mutation = null;
        if (state.mounted && currentIdentity.current === identity) setSnapshot(previous => ({ ...previous, busy: false }));
      }
    }
  }, [identity, token]);

  const create = useCallback(async (id: string, input: CustomerAddressInput): Promise<CustomerSavedAddress> => {
    const address = await mutate('POST', id, input);
    void refresh();
    return address!;
  }, [mutate, refresh]);
  const update = useCallback(async (id: string, input: CustomerAddressInput): Promise<CustomerSavedAddress> => {
    const address = await mutate('PUT', id, input);
    void refresh();
    return address!;
  }, [mutate, refresh]);
  const remove = useCallback(async (id: string): Promise<void> => {
    await mutate('DELETE', id);
    void refresh();
  }, [mutate, refresh]);

  const visible = snapshot.identity === identity && identity !== null;
  return {
    addresses: visible ? snapshot.addresses : [],
    loading: accountLoading || Boolean(identity && (!visible || snapshot.loading)),
    busy: visible && snapshot.busy,
    error: visible ? snapshot.error : null,
    refresh, create, update, remove,
  };
}
