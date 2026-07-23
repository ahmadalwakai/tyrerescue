import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBookingTyreLine, ensureBookingTyreLines } from '@/lib/assisted-chat-workflow';
import {
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';
import type {
  AssistedChatDraft,
  AssistedChatLocation,
  AssistedChatLockingWheelNut,
  AssistedChatQuoteBreakdown,
  AssistedChatQuoteLine,
  AssistedChatServiceType,
  AssistedChatTyreSelection,
} from '@/types/assisted-chat';

// Bumped key because old persisted drafts carried fields this streamlined
// phone-led flow no longer uses. Restore only the current draft shape.
const STORAGE_KEY = 'assistedChat.draft.v5';
const LEGACY_KEYS = ['assistedChat.draft.v4', 'assistedChat.draft.v3', 'assistedChat.draft.v2', 'assistedChat.draft.v1'] as const;
// Mirrors the web hook so a stale draft doesn't carry forward across days.
const STALE_AFTER_MS = 1000 * 60 * 60 * 12;

function normalizeServiceType(value: unknown): AssistedChatServiceType {
  return value === 'repair' || value === 'assess' ? value : 'fit';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeCustomer(value: unknown): AssistedChatDraft['customer'] {
  const record = isRecord(value) ? value : {};
  return {
    phone: stringValue(record.phone),
    name: stringValue(record.name),
    email: stringValue(record.email),
  };
}

function normalizeLocation(value: unknown): AssistedChatLocation {
  const record = isRecord(value) ? value : {};
  const status =
    record.status === 'pending' || record.status === 'received' || record.status === 'idle'
      ? record.status
      : EMPTY_DRAFT.location.status;
  return {
    method: record.method === 'link' ? 'link' : 'address',
    address: stringValue(record.address),
    lat: finiteNumber(record.lat),
    lng: finiteNumber(record.lng),
    postcode: nullableString(record.postcode),
    link: nullableString(record.link),
    whatsappLink: nullableString(record.whatsappLink),
    status,
  };
}

function normalizeLockingNut(value: unknown): AssistedChatLockingWheelNut {
  const record = isRecord(value) ? value : {};
  return {
    answer: record.answer === 'yes' || record.answer === 'no' ? record.answer : 'unknown',
    chargeGbp: finiteNumber(record.chargeGbp),
  };
}

function normalizePaymentChoice(value: unknown): AssistedChatDraft['paymentChoice'] {
  return value === 'cash' || value === 'deposit' || value === 'full' ? value : null;
}

function normalizeCustomerEmailMode(value: unknown): AssistedChatDraft['customerEmailMode'] {
  return value === 'send_customer_confirmation' ? 'send_customer_confirmation' : 'walk_in_customer';
}

function normalizeQuoteLine(value: unknown): AssistedChatQuoteLine | null {
  if (!isRecord(value)) return null;
  const amount = finiteNumber(value.amount);
  if (amount == null) return null;
  return {
    label: stringValue(value.label, 'Line item'),
    amount,
    type: stringValue(value.type, 'custom'),
    ...(finiteNumber(value.quantity) != null ? { quantity: finiteNumber(value.quantity) ?? undefined } : {}),
    ...(finiteNumber(value.unitPrice) != null ? { unitPrice: finiteNumber(value.unitPrice) ?? undefined } : {}),
  };
}

function normalizeQuote(value: unknown): AssistedChatQuoteBreakdown | null {
  if (!isRecord(value)) return null;
  const lineItems = Array.isArray(value.lineItems)
    ? value.lineItems.flatMap((line) => {
        const normalized = normalizeQuoteLine(line);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    ...(value as Partial<AssistedChatQuoteBreakdown>),
    subtotal: finiteNumber(value.subtotal) ?? 0,
    vatAmount: finiteNumber(value.vatAmount) ?? 0,
    total: finiteNumber(value.total) ?? 0,
    lineItems,
    distanceKm: finiteNumber(value.distanceKm),
    distanceMiles: finiteNumber(value.distanceMiles),
    serviceDistanceMiles: finiteNumber(value.serviceDistanceMiles),
    pricingDistanceMiles: finiteNumber(value.pricingDistanceMiles),
    pricingDurationMinutes: finiteNumber(value.pricingDurationMinutes),
    garageDistanceMiles: finiteNumber(value.garageDistanceMiles),
    fittingPrice: finiteNumber(value.fittingPrice),
    tyrePrice: finiteNumber(value.tyrePrice),
    totalPrice: finiteNumber(value.totalPrice),
    tyreLines: Array.isArray(value.tyreLines) ? ensureBookingTyreLines(value.tyreLines) : undefined,
    adminAdjustmentAmount: finiteNumber(value.adminAdjustmentAmount),
    adminAdjustmentReason: nullableString(value.adminAdjustmentReason),
  };
}

function normalizePaymentLink(value: unknown): AssistedChatDraft['paymentLink'] {
  if (!isRecord(value)) return null;
  const amountPence = finiteNumber(value.amountPence);
  const paymentUrl = stringValue(value.paymentUrl);
  const bookingId = stringValue(value.bookingId);
  const refNumber = stringValue(value.refNumber);
  const createdAtIso = stringValue(value.createdAtIso);
  if (
    (value.kind !== 'deposit' && value.kind !== 'full') ||
    amountPence == null ||
    !paymentUrl ||
    !bookingId ||
    !refNumber ||
    !createdAtIso
  ) {
    return null;
  }
  return {
    kind: value.kind,
    paymentUrl,
    amountPence,
    remainingBalancePence: finiteNumber(value.remainingBalancePence),
    bookingId,
    refNumber,
    createdAtIso,
  };
}

export const EMPTY_DRAFT: AssistedChatDraft = {
  customer: { phone: '', name: '', email: '' },
  location: {
    method: 'address',
    address: '',
    lat: null,
    lng: null,
    postcode: null,
    link: null,
    whatsappLink: null,
    status: 'idle',
  },
  serviceType: 'fit',
  tyreLines: [createBookingTyreLine({ id: 'tyre-1' })],
  lockingNut: { answer: 'unknown', chargeGbp: null },
  quickBookingId: null,
  virtualLandlineInteractionId: null,
  savedQuoteId: null,
  savedQuoteRef: null,
  note: '',
  quote: null,
  priceNeedsRefresh: false,
  manualPriceGbp: null,
  paymentChoice: null,
  paymentLink: null,
  dispatchedRefNumber: null,
  dispatchedBookingId: null,
  customerEmailMode: 'walk_in_customer',
  updatedAt: 0,
};

export function useAssistedChatDraft() {
  const [draft, setDraft] = useState<AssistedChatDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    logStartupModuleStarted('Assisted Chat draft hydration');
    (async () => {
      try {
        // Try v3 first; fall back through legacy keys so an in-flight
        // operator's draft is not lost on the version bump. Any legacy
        // payload found is migrated through the sanitizer below and the
        // legacy key is deleted.
        let raw = await AsyncStorage.getItem(STORAGE_KEY);
        let usedLegacyKey: string | null = null;
        if (!raw) {
          for (const key of LEGACY_KEYS) {
            const legacy = await AsyncStorage.getItem(key);
            if (legacy) {
              raw = legacy;
              usedLegacyKey = key;
              break;
            }
          }
        }
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as unknown;
          const parsedRecord: (Partial<AssistedChatDraft> & {
            updatedAt?: number;
            tyre?: Partial<AssistedChatTyreSelection>;
          }) | null = isRecord(parsed) ? (parsed as Partial<AssistedChatDraft>) : null;
          const updatedAt = finiteNumber(parsedRecord?.updatedAt) ?? 0;
          if (parsedRecord && updatedAt && Date.now() - updatedAt < STALE_AFTER_MS) {
            const legacyTyre = isRecord(parsedRecord.tyre) ? parsedRecord.tyre : {};
            const migratedTyreLines = Array.isArray(parsedRecord.tyreLines)
              ? ensureBookingTyreLines(parsedRecord.tyreLines)
              : ensureBookingTyreLines([
                  createBookingTyreLine({
                    id: 'tyre-1',
                    size: typeof legacyTyre.size === 'string' ? legacyTyre.size : '',
                    quantity:
                      typeof legacyTyre.quantity === 'number' && Number.isFinite(legacyTyre.quantity)
                        ? legacyTyre.quantity
                        : 1,
                  }),
                ]);
            const merged: AssistedChatDraft = {
              ...EMPTY_DRAFT,
              customer: normalizeCustomer(parsedRecord.customer),
              location: normalizeLocation(parsedRecord.location),
              serviceType: normalizeServiceType(parsedRecord.serviceType),
              tyreLines: migratedTyreLines,
              lockingNut: normalizeLockingNut(parsedRecord.lockingNut),
              quickBookingId: typeof parsedRecord.quickBookingId === 'string' ? parsedRecord.quickBookingId : null,
              virtualLandlineInteractionId:
                typeof parsedRecord.virtualLandlineInteractionId === 'string'
                  ? parsedRecord.virtualLandlineInteractionId
                  : null,
              savedQuoteId: typeof parsedRecord.savedQuoteId === 'string' ? parsedRecord.savedQuoteId : null,
              savedQuoteRef: typeof parsedRecord.savedQuoteRef === 'string' ? parsedRecord.savedQuoteRef : null,
              note: typeof parsedRecord.note === 'string' ? parsedRecord.note : EMPTY_DRAFT.note,
              quote: normalizeQuote(parsedRecord.quote),
              priceNeedsRefresh: Boolean(parsedRecord.priceNeedsRefresh),
              manualPriceGbp:
                typeof parsedRecord.manualPriceGbp === 'number' && Number.isFinite(parsedRecord.manualPriceGbp)
                  ? parsedRecord.manualPriceGbp
                  : null,
              paymentChoice: normalizePaymentChoice(parsedRecord.paymentChoice),
              paymentLink: normalizePaymentLink(parsedRecord.paymentLink),
              dispatchedRefNumber:
                typeof parsedRecord.dispatchedRefNumber === 'string' ? parsedRecord.dispatchedRefNumber : null,
              dispatchedBookingId:
                typeof parsedRecord.dispatchedBookingId === 'string' ? parsedRecord.dispatchedBookingId : null,
              customerEmailMode: normalizeCustomerEmailMode(parsedRecord.customerEmailMode),
              updatedAt,
            };
            setDraft(merged);
            if (usedLegacyKey) {
              AsyncStorage.removeItem(usedLegacyKey).catch((error) => {
                logStartupModuleFailed('Assisted Chat legacy draft cleanup', error);
              });
            }
          }
        }
        if (!cancelled) {
          logStartupModuleCompleted('Assisted Chat draft hydration');
        }
      } catch (error) {
        logStartupModuleFailed('Assisted Chat draft hydration', error);
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEY),
          ...LEGACY_KEYS.map((key) => AsyncStorage.removeItem(key)),
        ]).catch((cleanupError) => {
          logStartupModuleFailed('Assisted Chat draft cleanup', cleanupError);
        });
        if (!cancelled) {
          setDraft(EMPTY_DRAFT);
          logStartupModuleCompleted('Assisted Chat draft hydration', {
            recovered: true,
          });
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AssistedChatDraft) => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) => {
        logStartupModuleFailed('Assisted Chat draft persist', error);
      });
    }, 200);
  }, []);

  const update = useCallback(
    (patch: Partial<AssistedChatDraft>) => {
      setDraft((prev) => {
        const next: AssistedChatDraft = { ...prev, ...patch, updatedAt: Date.now() };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    (next: AssistedChatDraft) => {
      const stamped: AssistedChatDraft = { ...next, updatedAt: Date.now() };
      setDraft(stamped);
      persist(stamped);
    },
    [persist],
  );

  const clear = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    AsyncStorage.removeItem(STORAGE_KEY).catch((error) => {
      logStartupModuleFailed('Assisted Chat draft clear', error);
    });
  }, []);

  return { draft, hydrated, update, replace, clear };
}
