import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type JobAlertType = 'new_job' | 'reassignment' | 'upcoming_v2';

export interface JobAlertData {
  ref: string | null;
  title: string;
  body: string;
  alertType: JobAlertType;
}

interface JobAlertContextType {
  visible: boolean;
  alertData: JobAlertData | null;
  showAlert: (data: JobAlertData) => void;
  dismiss: () => void;
}

const JobAlertContext = createContext<JobAlertContextType>({
  visible: false,
  alertData: null,
  showAlert: () => {},
  dismiss: () => {},
});

export function JobAlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [alertData, setAlertData] = useState<JobAlertData | null>(null);

  const showAlert = useCallback((data: JobAlertData) => {
    // Replace any existing alert (no stacking)
    setAlertData(data);
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setAlertData(null);
  }, []);

  const value = useMemo(
    () => ({ visible, alertData, showAlert, dismiss }),
    [visible, alertData, showAlert, dismiss],
  );

  return (
    <JobAlertContext.Provider value={value}>
      {children}
    </JobAlertContext.Provider>
  );
}

export function useJobAlert() {
  return useContext(JobAlertContext);
}
