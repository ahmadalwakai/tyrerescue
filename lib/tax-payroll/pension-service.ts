import 'server-only';

/**
 * Pension auto-enrolment assessment service.
 *
 * Implements the Pensions Act 2008 auto-enrolment duty assessment.
 * Source: https://www.gov.uk/workplace-pensions-employers
 *         The Pensions Regulator thresholds (2026-27)
 *
 * This service ONLY:
 * - Assesses worker category (eligible / non-eligible / entitled)
 * - Determines enrolment/opt-out/re-enrolment status
 * - Calculates contribution amounts (qualifying earnings basis)
 * - Records assessment results
 *
 * This service does NOT:
 * - Send money to pension providers
 * - Create pension provider accounts
 * - Integrate with any pension API
 *
 * All money amounts in pence.
 */

export type WorkerCategory =
  | 'eligible_jobholder'  // aged 22-SP age, earnings >= trigger, enrol immediately
  | 'non_eligible_jobholder'  // may request enrolment
  | 'entitled_worker';    // may request enrolment, lower contributions

export type EnrolmentStatus =
  | 'not_assessed'
  | 'enrolled'
  | 'opted_out'
  | 'postponed'
  | 'ceased';

export type ContributionBasis = 'qualifying_earnings' | 'pensionable_pay' | 'salary_sacrifice';

// ─── 2026-27 Auto-enrolment thresholds ───────────────────────────────────────
// Source: https://www.gov.uk/government/publications/review-of-the-automatic-enrolment-earnings-trigger-and-qualifying-earnings-band-for-202627
// Verified 2026-10-21. Pension thresholds are independent of NI thresholds.
// NOTE: Update annually when DWP/TPR confirm new thresholds

export const AE_THRESHOLDS_2026_27 = {
  taxYear: '2026-27',
  /** Earnings trigger for automatic enrolment (annual). */
  enrolmentTriggerPencePerYear: 1_000_000, // £10,000
  /** Lower limit of qualifying earnings band. */
  qualifyingEarningsLowerPencePerYear: 624_000, // £6,240
  /** Upper limit of qualifying earnings band. */
  qualifyingEarningsUpperPencePerYear: 5_027_000, // Same as NI UEL: £50,270
  /** Minimum employee contribution rate (on qualifying earnings). */
  minEmployeeContributionRate: 0.05,
  /** Minimum employer contribution rate (on qualifying earnings). */
  minEmployerContributionRate: 0.03,
  /** Total minimum combined contribution rate. */
  minTotalContributionRate: 0.08,
  /** State Pension age — used for eligibility upper bound (approximate). */
  statePensionAgeApproximate: 67,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PensionAssessmentInput {
  employeeId: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  assessmentDate: string;     // YYYY-MM-DD
  annualisedEarningsPence: number;
  currentEnrolmentStatus: EnrolmentStatus;
  enrolmentDate: string | null;
  optOutWindowEnds: string | null;
  schemeContributionBasis: ContributionBasis;
  /** Employee contribution rate (configured by employer). */
  employeeContributionRate: number;
  /** Employer contribution rate (configured by employer). */
  employerContributionRate: number;
}

export interface PensionContribution {
  qualifyingEarningsPence: number;
  employeeContributionPence: number;
  employerContributionPence: number;
  totalContributionPence: number;
  meetsMinimum: boolean;
}

export interface PensionAssessmentResult {
  employeeId: string;
  assessmentDate: string;
  workerCategory: WorkerCategory;
  enrolmentStatus: EnrolmentStatus;
  actionRequired: 'enrol' | 're_enrol' | 'none' | 'reenrolment_due';
  contribution: PensionContribution | null;
  thresholdsVersion: string;
  notes: string[];
}

// ─── Assessment ───────────────────────────────────────────────────────────────

export function assessPensionEnrolment(input: PensionAssessmentInput): PensionAssessmentResult {
  if (input.assessmentDate < '2026-04-06' || input.assessmentDate > '2027-04-05') {
    throw new RangeError('No verified pension assessment thresholds are available for this date.');
  }
  const thresholds = AE_THRESHOLDS_2026_27;
  const notes: string[] = [];

  // Age at assessment date
  let ageYears: number | null = null;
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    const assessed = new Date(input.assessmentDate);
    ageYears = assessed.getFullYear() - dob.getFullYear();
    const m = assessed.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && assessed.getDate() < dob.getDate())) ageYears--;
  }

  // Worker category
  let workerCategory: WorkerCategory;
  if (ageYears === null) {
    notes.push('Date of birth not recorded — cannot determine worker category by age. Treating as non-eligible pending confirmation.');
    workerCategory = 'non_eligible_jobholder';
  } else if (ageYears < 16) {
    notes.push('Worker is under 16 — not a worker for AE purposes.');
    workerCategory = 'entitled_worker';
  } else if (ageYears >= thresholds.statePensionAgeApproximate) {
    notes.push('Worker is at or above State Pension age — not eligible for auto-enrolment.');
    workerCategory = 'non_eligible_jobholder';
  } else if (ageYears >= 22 && input.annualisedEarningsPence >= thresholds.enrolmentTriggerPencePerYear) {
    workerCategory = 'eligible_jobholder';
  } else if (input.annualisedEarningsPence >= thresholds.qualifyingEarningsLowerPencePerYear) {
    workerCategory = 'non_eligible_jobholder';
  } else {
    workerCategory = 'entitled_worker';
  }

  // Enrolment action
  let actionRequired: PensionAssessmentResult['actionRequired'] = 'none';
  let enrolmentStatus = input.currentEnrolmentStatus;

  if (workerCategory === 'eligible_jobholder' && enrolmentStatus === 'not_assessed') {
    actionRequired = 'enrol';
  }

  // Re-enrolment check: every 3 years employers must re-enrol opted-out eligible workers
  if (enrolmentStatus === 'opted_out' && workerCategory === 'eligible_jobholder') {
    if (input.enrolmentDate) {
      const enrolDate = new Date(input.enrolmentDate);
      const assessed = new Date(input.assessmentDate);
      const yearsSince = (assessed.getTime() - enrolDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (yearsSince >= 3) {
        actionRequired = 'reenrolment_due';
        notes.push('Re-enrolment window: 3 years since initial enrolment date has passed.');
      }
    }
  }

  // Contributions
  let contribution: PensionContribution | null = null;
  if (enrolmentStatus === 'enrolled') {
    const lower = thresholds.qualifyingEarningsLowerPencePerYear;
    const upper = thresholds.qualifyingEarningsUpperPencePerYear;
    const qualifyingEarningsPence = Math.max(0, Math.min(input.annualisedEarningsPence, upper) - lower);

    const employeeContributionPence = Math.trunc(qualifyingEarningsPence * input.employeeContributionRate);
    const employerContributionPence = Math.trunc(qualifyingEarningsPence * input.employerContributionRate);
    const totalContributionPence = employeeContributionPence + employerContributionPence;
    const totalRate = input.employeeContributionRate + input.employerContributionRate;
    const meetsMinimum =
      input.employeeContributionRate >= thresholds.minEmployeeContributionRate &&
      input.employerContributionRate >= thresholds.minEmployerContributionRate &&
      totalRate >= thresholds.minTotalContributionRate;

    if (!meetsMinimum) {
      notes.push(
        `Contribution rates do not meet minimum: employee ${(input.employeeContributionRate * 100).toFixed(1)}% ` +
        `(min ${thresholds.minEmployeeContributionRate * 100}%), employer ${(input.employerContributionRate * 100).toFixed(1)}% ` +
        `(min ${thresholds.minEmployerContributionRate * 100}%). Review configuration.`,
      );
    }

    contribution = {
      qualifyingEarningsPence,
      employeeContributionPence,
      employerContributionPence,
      totalContributionPence,
      meetsMinimum,
    };
  }

  return {
    employeeId: input.employeeId,
    assessmentDate: input.assessmentDate,
    workerCategory,
    enrolmentStatus,
    actionRequired,
    contribution,
    thresholdsVersion: thresholds.taxYear,
    notes,
  };
}
