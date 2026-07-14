import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { Platform } from 'react-native';

export type JobAlertType = 'new_job' | 'reassignment' | 'upcoming_v2';

export interface JobAlertData {
  ref: string | null;
  title: string;
  body: string;
  alertType: JobAlertType;
  customerPhone?: string | null;
  paymentLabel?: string | null;
  urgencyLabel?: string | null;
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

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof __DEV__ === 'undefined' || !__DEV__) return undefined;

    const target = globalThis as typeof globalThis & {
      __showDriverJobAlert?: (data: JobAlertData) => void;
      __hideDriverJobAlert?: () => void;
    };
    target.__showDriverJobAlert = showAlert;
    target.__hideDriverJobAlert = dismiss;

    return () => {
      if (target.__showDriverJobAlert === showAlert) delete target.__showDriverJobAlert;
      if (target.__hideDriverJobAlert === dismiss) delete target.__hideDriverJobAlert;
    };
  }, [showAlert, dismiss]);

  return (
    <JobAlertContext.Provider value={value}>
      {children}
    </JobAlertContext.Provider>
  );
}

export function useJobAlert() {
  return useContext(JobAlertContext);
}
