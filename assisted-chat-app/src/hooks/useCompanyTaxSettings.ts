import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type {
  CompanyProfileDto,
  UpdateCompanyRequest,
  TaxApiError,
} from '../types/tax-payroll';

interface State {
  data: CompanyProfileDto | null;
  loading: boolean;
  error: string | null;
}

export function useCompanyTaxSettings(companyId: string) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TaxApiError | null>(null);

  const load = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await api.get<CompanyProfileDto>(`/api/admin/tax/companies/${companyId}`);
      setState({ data, loading: false, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load company';
      setState({ data: null, loading: false, error: msg });
    }
  }, [companyId]);

  const updateCompany = useCallback(
    async (patch: Omit<UpdateCompanyRequest, 'expectedVersion'>): Promise<CompanyProfileDto | null> => {
      if (!state.data) return null;
      setSaving(true);
      setSaveError(null);

      const body: UpdateCompanyRequest = { ...patch, expectedVersion: state.data.version };

      try {
        const updated = await api.patch<CompanyProfileDto>(
          `/api/admin/tax/companies/${companyId}`,
          body,
        );
        setState((prev) => ({ ...prev, data: updated }));
        return updated;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'details' in err) {
          setSaveError(err.details as TaxApiError);
        } else {
          setSaveError({ error: err instanceof Error ? err.message : 'Failed to save', code: 'INTERNAL' });
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [companyId, state.data],
  );

  return {
    company: state.data,
    loading: state.loading,
    error: state.error,
    saving,
    saveError,
    load,
    updateCompany,
  };
}
