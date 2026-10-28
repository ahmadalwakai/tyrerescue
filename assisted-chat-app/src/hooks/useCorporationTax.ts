import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { CorporationTaxPeriodDto } from '../types/tax-payroll';

interface UpdateCorporationTaxPeriodRequest {
  expectedVersion: number;
  tradingProfitsPence?: number;
  nonTradingIncomePence?: number;
  chargeableGainsPence?: number;
  exemptDistributionsPence?: number;
  associatedCompanies?: number;
}

export function useCorporationTax(companyId: string) {
  const [period, setPeriod] = useState<CorporationTaxPeriodDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeriod = useCallback(
    async (periodId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ period: CorporationTaxPeriodDto }>(
          `/api/admin/tax/companies/${companyId}/corporation-tax/periods/${periodId}`,
        );
        setPeriod(res.period);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load CT period');
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  const updatePeriod = useCallback(
    async (periodId: string, req: UpdateCorporationTaxPeriodRequest): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const res = await api.patch<{ calculation: CorporationTaxPeriodDto; newVersion: number }>(
          `/api/admin/tax/companies/${companyId}/corporation-tax/periods/${periodId}`,
          req,
        );
        setPeriod((p) => p ? { ...p, ...res.calculation, version: res.newVersion } : null);
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to update CT period');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  return { period, loading, saving, error, loadPeriod, updatePeriod };
}
