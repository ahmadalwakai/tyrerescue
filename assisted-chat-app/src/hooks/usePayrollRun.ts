import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type {
  TaxApiError,
  FinaliseRunRequest,
  SubmitRunForReviewRequest,
  ProcessReviewRequest,
  ReviewDto,
  FinalisedRunSummaryDto,
  PayslipDocumentDto,
  SubmissionReadinessDto,
} from '../types/tax-payroll';

export function usePayrollRun(companyId: string, runId: string) {
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<TaxApiError | null>(null);
  const [finalising, setFinalising] = useState(false);
  const [finaliseError, setFinaliseError] = useState<TaxApiError | null>(null);
  const [finaliseResult, setFinaliseResult] = useState<FinalisedRunSummaryDto | null>(null);
  const [review, setReview] = useState<ReviewDto | null>(null);
  const [payslips, setPayslips] = useState<PayslipDocumentDto[]>([]);
  const [rtiGuard, setRtiGuard] = useState<SubmissionReadinessDto | null>(null);

  const loadReview = useCallback(async () => {
    try {
      const res = await api.get<{ review: ReviewDto | null }>(
        `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/review`,
      );
      setReview(res.review);
    } catch {
      // non-fatal
    }
  }, [companyId, runId]);

  const submitForReview = useCallback(
    async (req: SubmitRunForReviewRequest): Promise<ReviewDto | null> => {
      setSubmittingReview(true);
      setReviewError(null);
      try {
        const res = await api.post<{ review: ReviewDto }>(
          `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/review`,
          req,
        );
        setReview(res.review);
        return res.review;
      } catch (err: unknown) {
        setReviewError(
          err && typeof err === 'object' && 'details' in err
            ? (err as { details: TaxApiError }).details
            : { error: err instanceof Error ? err.message : 'Failed to submit for review', code: 'INTERNAL' },
        );
        return null;
      } finally {
        setSubmittingReview(false);
      }
    },
    [companyId, runId],
  );

  const processReview = useCallback(
    async (req: ProcessReviewRequest): Promise<ReviewDto | null> => {
      setSubmittingReview(true);
      setReviewError(null);
      try {
        const res = await api.patch<{ review: ReviewDto }>(
          `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/review`,
          req,
        );
        setReview(res.review);
        return res.review;
      } catch (err: unknown) {
        setReviewError(
          err && typeof err === 'object' && 'details' in err
            ? (err as { details: TaxApiError }).details
            : { error: err instanceof Error ? err.message : 'Failed to process review', code: 'INTERNAL' },
        );
        return null;
      } finally {
        setSubmittingReview(false);
      }
    },
    [companyId, runId],
  );

  const finalise = useCallback(
    async (req: FinaliseRunRequest): Promise<FinalisedRunSummaryDto | null> => {
      setFinalising(true);
      setFinaliseError(null);
      try {
        const result = await api.post<FinalisedRunSummaryDto>(
          `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/finalise`,
          req,
        );
        setFinaliseResult(result);
        return result;
      } catch (err: unknown) {
        setFinaliseError(
          err && typeof err === 'object' && 'details' in err
            ? (err as { details: TaxApiError }).details
            : { error: err instanceof Error ? err.message : 'Failed to finalise run', code: 'INTERNAL' },
        );
        return null;
      } finally {
        setFinalising(false);
      }
    },
    [companyId, runId],
  );

  const loadPayslips = useCallback(async () => {
    try {
      const res = await api.get<{ payslips: PayslipDocumentDto[] }>(
        `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/payslips`,
      );
      setPayslips(res.payslips);
    } catch {
      // non-fatal
    }
  }, [companyId, runId]);

  const checkRtiReadiness = useCallback(async () => {
    try {
      const guard = await api.get<SubmissionReadinessDto>(
        `/api/admin/tax/companies/${companyId}/payroll/runs/${runId}/rti`,
      );
      setRtiGuard(guard);
    } catch {
      // non-fatal
    }
  }, [companyId, runId]);

  return {
    review,
    submittingReview,
    reviewError,
    finalising,
    finaliseError,
    finaliseResult,
    payslips,
    rtiGuard,
    loadReview,
    submitForReview,
    processReview,
    finalise,
    loadPayslips,
    checkRtiReadiness,
  };
}
