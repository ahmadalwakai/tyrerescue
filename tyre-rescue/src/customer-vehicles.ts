import type { CustomerBookingSummary } from './customer-account';

export function bookingRepeatParams(booking: CustomerBookingSummary) {
  return {
    repeatRef: booking.refNumber,
    vehicleReg: booking.vehicleReg ?? '',
    vehicleMake: booking.vehicleMake ?? '',
    vehicleModel: booking.vehicleModel ?? '',
    tyreSizeDisplay: booking.tyreSizeDisplay ?? '',
    tyreQuantity: booking.tyreQuantity ? String(booking.tyreQuantity) : '',
    serviceType: booking.serviceType,
  };
}

export function recentCustomerVehicles(bookings: CustomerBookingSummary[]) {
  const seen = new Set<string>();
  return bookings.filter((booking) => {
    const key = booking.vehicleReg?.replace(/\s/g, '').toUpperCase() ||
      [booking.vehicleMake, booking.vehicleModel, booking.tyreSizeDisplay].filter(Boolean).join('|').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
