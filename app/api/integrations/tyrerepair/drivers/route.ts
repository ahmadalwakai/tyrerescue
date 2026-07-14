import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, drivers, users } from "@/lib/db";
import {
  isAuthorizedIntegrationRequest,
  integrationUnauthorized,
} from "../_lib";

export const dynamic = "force-dynamic";

/**
 * Inbound endpoint: tyrerepair.uk fetches the tyrerescue driver roster so an
 * admin can pick which driver a field job should go to. Read-only; additive.
 */
export async function GET(request: Request) {
  if (!isAuthorizedIntegrationRequest(request))
    return integrationUnauthorized();

  const url = new URL(request.url);
  const onlyAvailable = url.searchParams.get("available") === "1";

  const rows = await db
    .select({
      id: drivers.id,
      name: users.name,
      phone: users.phone,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
      pushToken: drivers.pushToken,
      pushTokenPlatform: drivers.pushTokenPlatform,
      appVersion: drivers.appVersion,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .orderBy(desc(drivers.isOnline), desc(drivers.createdAt));

  const items = rows
    .filter((d) =>
      onlyAvailable
        ? d.isOnline &&
          d.status !== "offline" &&
          Boolean(d.pushToken) &&
          d.currentLat != null &&
          d.currentLng != null
        : true,
    )
    .map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      isOnline: Boolean(d.isOnline),
      status: d.status,
      currentLat: d.currentLat?.toString() ?? null,
      currentLng: d.currentLng?.toString() ?? null,
      locationAt: d.locationAt?.toISOString() ?? null,
      hasPushToken: Boolean(d.pushToken),
      pushTokenPlatform: d.pushTokenPlatform,
      appVersion: d.appVersion,
      canReceiveJobs: Boolean(d.pushToken),
      hasLiveGps: d.currentLat != null && d.currentLng != null,
    }));

  return NextResponse.json({ items });
}
