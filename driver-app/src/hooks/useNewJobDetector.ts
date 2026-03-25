import { useRef, useCallback } from 'react';
import { useJobAlert } from '@/context/job-alert-context';
import {
  detectNewRefs,
  markAlerted,
  fireNewJobAlert,
} from '@/services/job-alert';
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

  const checkForNewJobs = useCallback(
    (jobs: JobSummary[]) => {
      const currentRefs = jobs.map((j) => j.refNumber);

      // First call: seed knownRefs with existing jobs and skip alerting
      if (!initializedRef.current) {
        knownRefs.current = new Set(currentRefs);
        initializedRef.current = true;
        return;
      }

      const newRefs = detectNewRefs(knownRefs.current, currentRefs);

      if (newRefs.length > 0) {
        // Find the first new job to display in the popup
        const firstNew = jobs.find((j) => newRefs.includes(j.refNumber));

        // Mark all new refs as alerted
        for (const ref of newRefs) {
          markAlerted(ref);
        }

        // Fire sound + vibration
        fireNewJobAlert();

        // Show full-screen popup for the first new job
        if (firstNew) {
          showAlert({
            ref: firstNew.refNumber,
            title: '',
            body: firstNew.addressLine ?? '',
          });
        }
      }

      // Update known refs for next comparison
      knownRefs.current = new Set(currentRefs);
    },
    [showAlert],
  );

  return { checkForNewJobs };
}
