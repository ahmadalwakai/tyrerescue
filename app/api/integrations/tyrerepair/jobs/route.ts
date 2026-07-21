import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bookings, bookingStatusHistory, drivers } from "@/lib/db";
import { generateRefNumber } from "@/lib/utils";
import { executeTransition } from "@/lib/state-machine";
import { notifyDriverNewJob } from "@/lib/notifications/driver-push";
import { buildPaymentSummary } from "@/lib/payments/payment-summary";
import {
  isAuthorizedIntegrationRequest,
  integrationUnauthorized,
} from "../_lib";

export const dynamic = "force-dynamic";

interface InboundJobBody {
  driverId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addressLine?: string;
  lat?: number | string;
  lng?: number | string;
  serviceType?: string;
  bookingType?: string;
  quantity?: number;
  tyreSizeDisplay?: string;
  vehicleReg?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  scheduledAt?: string;
  paymentType?: string;
  totalAmount?: number | string;
  subtotal?: number | string;
  vatAmount?: number | string;
  depositAmountPence?: number;
  remainingBalancePence?: number;
  notes?: string;
  /** Caller's own booking reference, stored for cross-system reconciliation. */
  externalRef?: string;
}

function toMoneyString(
  value: number | string | undefined | null,
): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function toCoordString(
  value: number | string | undefined | null,
): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(6);
}

/**
 * Inbound endpoint: tyrerepair.uk pushes a field job into tyrerescue dispatch.
 *
 * Creates a booking, assigns the chosen driver, transitions it to
 * `driver_assigned` and fires the existing new-job push (FCM lock-screen alert).
 * The job then appears in the standard tyrerescue driver app with the in-app
 * map and live tracking — no driver-app or behaviour changes required.
 */
export async function POST(request: Request) {
  if (!isAuthorizedIntegrationRequest(request))
    return integrationUnauthorized();

  let body: InboundJobBody;
  try {
    body = (await request.json()) as InboundJobBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const driverId = String(body.driverId || "").trim();
  const customerName = String(body.customerName || "").trim();
  const customerEmail = String(body.customerEmail || "").trim();
  const customerPhone = String(body.customerPhone || "").trim();
  const addressLine = String(body.addressLine || "").trim();
  const serviceType = String(body.serviceType || "").trim();
  const lat = toCoordString(body.lat);
  const lng = toCoordString(body.lng);
  const totalAmount = toMoneyString(body.totalAmount);

  const missing: string[] = [];
  if (!driverId) missing.push("driverId");
  if (!customerName) missing.push("customerName");
  if (!customerPhone) missing.push("customerPhone");
  if (!addressLine) missing.push("addressLine");
  if (!serviceType) missing.push("serviceType");
  if (lat == null) missing.push("lat");
  if (lng == null) missing.push("lng");
  if (totalAmount == null) missing.push("totalAmount");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing or invalid fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const [driver] = await db
    .select({
      id: drivers.id,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      pushToken: drivers.pushToken,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);
  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }
  if (!driver.pushToken) {
    return NextResponse.json(
      {
        error:
          "Driver app is not connected for this driver. Open the Tyre Rescue driver app and sign in once before assigning jobs.",
        code: "driver_app_not_connected",
      },
      { status: 409 },
    );
  }
  if (!driver.isOnline || driver.status === "offline") {
    return NextResponse.json(
      {
        error:
          "Driver is offline. Choose an online Tyre Rescue driver before assigning this job.",
        code: "driver_offline",
      },
      { status: 409 },
    );
  }
  if (driver.currentLat == null || driver.currentLng == null) {
    return NextResponse.json(
      {
        error:
          "Driver has no live GPS yet. Ask the driver to open the Tyre Rescue app and allow location before assigning this job.",
        code: "driver_live_gps_missing",
      },
      { status: 409 },
    );
  }

  const subtotal = toMoneyString(body.subtotal) ?? totalAmount!;
  const vatAmount = toMoneyString(body.vatAmount) ?? "0.00";
  const paymentType: "cash" | "full" | "deposit" =
    body.paymentType === "cash" ||
    body.paymentType === "full" ||
    body.paymentType === "deposit"
      ? body.paymentType
      : "cash";

  // Generate a unique reference (retry on the rare collision).
  let refNumber = generateRefNumber();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [clash] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);
    if (!clash) break;
    refNumber = generateRefNumber();
  }

  const now = new Date();
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const originNote = "[via tyrerepair.uk]";
  const notes = [
    originNote,
    body.externalRef ? `ext:${body.externalRef}` : null,
    body.notes,
  ]
    .filter(Boolean)
    .join(" ");

  let bookingId: string;
  try {
    const [created] = await db
      .insert(bookings)
      .values({
        refNumber,
        status: "paid",
        bookingType: String(body.bookingType || "mobile_fitting"),
        serviceType,
        addressLine,
        lat: lat!,
        lng: lng!,
        quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : 1,
        tyreSizeDisplay: body.tyreSizeDisplay
          ? String(body.tyreSizeDisplay)
          : null,
        vehicleReg: body.vehicleReg ? String(body.vehicleReg) : null,
        vehicleMake: body.vehicleMake ? String(body.vehicleMake) : null,
        vehicleModel: body.vehicleModel ? String(body.vehicleModel) : null,
        customerName,
        customerEmail: customerEmail || "noreply@tyrerepair.uk",
        customerPhone,
        scheduledAt:
          scheduledAt && !Number.isNaN(scheduledAt.getTime())
            ? scheduledAt
            : null,
        priceSnapshot: {
          source: "tyrerepair.uk",
          externalRef: body.externalRef ?? null,
        },
        subtotal,
        vatAmount,
        totalAmount: totalAmount!,
        paymentType,
        depositAmountPence:
          typeof body.depositAmountPence === "number"
            ? body.depositAmountPence
            : null,
        remainingBalancePence:
          typeof body.remainingBalancePence === "number"
            ? body.remainingBalancePence
            : null,
        referrer: "tyrerepair.uk",
        notes,
        driverId,
        assignedAt: now,
        acceptanceDeadline: new Date(now.getTime() + 10 * 60 * 1000),
        updatedAt: now,
      })
      .returning({ id: bookings.id });
    bookingId = created.id;
  } catch (err) {
    console.error("[tyrerepair-integration] booking insert failed:", err);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 },
    );
  }

  await db.insert(bookingStatusHistory).values({
    bookingId,
    fromStatus: null,
    toStatus: "paid",
    actorUserId: null,
    actorRole: "system",
    note: "Booking created via tyrerepair.uk integration",
  });

  // Move the booking into the driver-assigned state via the canonical machine.
  const transition = await executeTransition(
    bookingId,
    "driver_assigned",
    { role: "system" },
    "Job pushed from tyrerepair.uk",
  );
  if (!transition.success) {
    return NextResponse.json(
      { error: transition.error || "Unable to assign driver", refNumber },
      { status: 400 },
    );
  }

  const driverPayment = buildPaymentSummary(
    {
      id: bookingId,
      refNumber,
      status: "driver_assigned",
      paymentType,
      totalAmount: totalAmount!,
      subtotal,
      vatAmount,
      depositAmountPence:
        typeof body.depositAmountPence === "number"
          ? body.depositAmountPence
          : null,
      remainingBalancePence:
        typeof body.remainingBalancePence === "number"
          ? body.remainingBalancePence
          : null,
      depositPaidAt: null,
      stripePiId: null,
    },
    [],
  );

  // Wake the driver app with a full-screen job alert. Retry once on a transient
  // failure; never re-send on success to avoid duplicate alerts.
  try {
    const first = await notifyDriverNewJob(
      driverId,
      refNumber,
      addressLine,
      driverPayment,
      bookingId,
    );
    if (!first) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      await notifyDriverNewJob(
        driverId,
        refNumber,
        addressLine,
        driverPayment,
        bookingId,
      );
    }
  } catch (pushError) {
    console.error("[tyrerepair-integration] new-job push failed:", pushError);
  }

  return NextResponse.json({
    success: true,
    refNumber,
    bookingId,
    driverId,
    status: "driver_assigned",
  });
}
