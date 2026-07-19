import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

export interface DriverListItem {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  status: string | null;
  currentLat: string | null;
  currentLng: string | null;
  locationAt: string | null;
  activeJobRef?: string | null;
}

export function useDriverList() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<DriverListItem[]>('/api/admin/drivers');
      setDrivers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { drivers, loading, error, reload: load };
}
