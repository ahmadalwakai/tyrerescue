import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { VatPeriodDto, VatReturnDto } from '../types/tax-payroll';

export function useVatReturn(companyId: string) {
  const [periods, setPeriods] = useState<VatPeriodDto[]>([]);
  const [activeReturn, setActiveReturn] = useState<VatReturnDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ periods: VatPeriodDto[] }>(
        `/api/admin/tax/companies/${companyId}/vat/periods`,
      );
      setPeriods(res.periods);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load VAT periods');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const calculateReturn = useCallback(
    async (periodId: string): Promise<VatReturnDto | null> => {
      setCalculating(true);
      setError(null);
      try {
        const res = await api.post<{ draft: VatReturnDto; returnId: string }>(
          `/api/admin/tax/companies/${companyId}/vat/periods`,
          { periodId },
        );
        setActiveReturn(res.draft as unknown as VatReturnDto);
        return res.draft as unknown as VatReturnDto;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to calculate VAT return');
        return null;
      } finally {
        setCalculating(false);
      }
    },
    [companyId],
  );

  return { periods, activeReturn, loading, calculating, error, loadPeriods, calculateReturn };
}
