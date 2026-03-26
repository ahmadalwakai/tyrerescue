import { useRef, useCallback } from 'react';
import { useJobAlert } from '@/context/job-alert-context';
import {
  detectNewRefs,
  markAlerted,
  fireJobAlert,
} from '@/services/job-alert';
import { fireLocalCriticalNotification } from '@/services/notifications';
import type { JobSummary } from '@/api/client';

/**
 * Hook that detects newly-arrived jobs from polling data and fires alerts.
 *
 * Call `checkForNewJobs(allJobs)` after every fetch. It compares the current
 * job list (active + upcoming) against the previously known set of refs
 * and triggers the popup + sound + vibration for any truly new job.
 *
 * Each job alerts at most once per app session (shared with push path).
 */
export function useNewJobDetector() {
  const knownRefs = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const { showAlert } = useJobAlert();

  /** Reset detector state (call on logout / new session). */
  const reset = useCallback(() => {
    knownRefs.current = new Set();
    initializedRef.current = false;
  }, []);

  const checkForNewJobs = useCallback(
    (jobs: JobSummary[]) => {
      const currentRefs = [
        ...new Set(jobs.map((j) => j.refNumber).filter(Boolean)),
      ];

      // First call after reset: seed knownRefs with existing jobs, skip alerting
      if (!initializedRef.current) {
        knownRefs.current = new Set(currentRefs);
        initializedRef.current = true;
        return;
      }

      const newRefs = detectNewRefs(knownRefs.current, currentRefs);

      if (newRefs.length > 0) {
        const firstNew = jobs.find((j) => newRefs.includes(j.refNumber));

        for (const ref of newRefs) {
          markAlerted(ref, 'new_job');
        }

        // Fire local notification on critical channel for native sound + tray entry
        if (firstNew) {
          fireLocalCriticalNotification(
            'New Job Assigned',
            firstNew.addressLine ?? '',
            { type: 'new_job', ref: firstNew.refNumber },
            'jobs_critical_v3',
          );
        }

        // In-app vibration (supplement to native channel vibration)
        fireJobAlert('new_job');

        if (firstNew) {
          showAlert({
            ref: firstNew.refNumber,
            title: '',
            body: firstNew.addressLine ?? '',
            alertType: 'new_job',
          });
        }
      }

      knownRefs.current = new Set(currentRefs);
    },
    [showAlert],
  );

  return { checkForNewJobs, reset };
}
