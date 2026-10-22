import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type {
  PayrollRunDto,
  PayrollRunLineDto,
  GrossPayPreviewDto,
  UpsertRunLinesRequest,
  TaxApiError,
} from '../types/tax-payroll';

interface State {
  run: PayrollRunDto | null;
  loading: boolean;
  error: string | null;
}

export function usePayrollDraft(companyId: string, runId: string) {
  const [state, setState] = useState<State>({ run: null, loading: false, error: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TaxApiError | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<TaxApiError | null>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const run = await api.get<PayrollRunDto>(
        `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}`,
      );
      setState({ run, loading: false, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load pay run';
      setState({ run: null, loading: false, error: msg });
    }
  }, [companyId, runId]);

  const upsertLines = useCallback(
    async (input: UpsertRunLinesRequest): Promise<PayrollRunLineDto[] | null> => {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await api.patch<{ lines: PayrollRunLineDto[] }>(
          `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}`,
          input,
        );
        await load();
        return result.lines;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'details' in err) {
          setSaveError(err.details as TaxApiError);
        } else {
          setSaveError({ error: err instanceof Error ? err.message : 'Failed to update lines', code: 'INTERNAL' });
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [companyId, runId, load],
  );

  const calculatePreview = useCallback(async (): Promise<GrossPayPreviewDto | null> => {
    setCalculating(true);
    setCalcError(null);
    try {
      const preview = await api.post<GrossPayPreviewDto>(
        `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/preview`,
        {},
      );
      await load();
      return preview;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'details' in err) {
        setCalcError(err.details as TaxApiError);
      } else {
        setCalcError({ error: err instanceof Error ? err.message : 'Failed to calculate preview', code: 'INTERNAL' });
      }
      return null;
    } finally {
      setCalculating(false);
    }
  }, [companyId, runId, load]);

  const cancelRun = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.del(`/api/admin/tax/companies/${companyId}/payroll/runs/${runId}`);
      await load();
      return true;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'details' in err) {
        setSaveError(err.details as TaxApiError);
      } else {
        setSaveError({ error: err instanceof Error ? err.message : 'Failed to cancel run', code: 'INTERNAL' });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [companyId, runId, load]);

  return {
    run: state.run,
    loading: state.loading,
    error: state.error,
    saving,
    saveError,
    calculating,
    calcError,
    load,
    upsertLines,
    calculatePreview,
    cancelRun,
  };
}
