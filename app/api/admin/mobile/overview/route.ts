import { GET as getMobileAdminDashboard } from '@/app/api/mobile/admin/dashboard/route';

export async function GET(request: Request) {
  return getMobileAdminDashboard(request);
}
