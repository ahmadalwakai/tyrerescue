'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Button,
} from '@chakra-ui/react';
import Link from 'next/link';
import { formatPrice } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface TyreDetail {
  brand: string;
  pattern: string;
  sizeDisplay: string;
  condition: string;
  quantity: number;
  unitPrice: number;
}

interface BookingData {
  refNumber: string;
  status: string;
  bookingType: 'emergency' | 'scheduled';
  serviceType: string;
  addressLine: string;
  distanceMiles: number | null;
  customerName: string;
  customerEmail: string;
  scheduledAt: string | null;
  createdAt: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  tyres: TyreDetail[];
}

interface SuccessContentProps {
  booking: BookingData;
}

export function SuccessContent({ booking }: SuccessContentProps) {
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  // Calculate ETA for emergency bookings
  // Rough estimate: 30 minutes base + 2 minutes per mile
  useEffect(() => {
    if (booking.bookingType === 'emergency' && booking.distanceMiles) {
      const baseTime = 30; // minutes for driver preparation
      const travelTime = Math.ceil(booking.distanceMiles * 2); // ~30mph average
      setEtaMinutes(baseTime + travelTime);
    }
  }, [booking.bookingType, booking.distanceMiles]);

  // Generate ICS file for calendar
  const generateICS = () => {
    if (!booking.scheduledAt) return;

    const startDate = new Date(booking.scheduledAt);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tyre Rescue//Booking//EN',
      'BEGIN:VEVENT',
      `UID:${booking.refNumber}@tyrerescue.co.uk`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:Tyre Rescue - Mobile Tyre Fitting`,
      `DESCRIPTION:Booking Reference: ${booking.refNumber}\\nAddress: ${booking.addressLine}\\nService: ${booking.serviceType}`,
      `LOCATION:${booking.addressLine}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tyre-rescue-${booking.refNumber}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Check if tracking is available
  const trackingStatuses = ['driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'];
  const isTrackingAvailable = trackingStatuses.includes(booking.status);

  return (
    <Container maxW="container.md" py={12}>
      <VStack gap={8} align="stretch">
        {/* Success Header */}
        <Box textAlign="center" style={anim.scaleIn('0.6s')}>
          <Text fontSize="lg" color="green.400" fontWeight="500" mb={2}>
            Booking Confirmed
          </Text>
          <Text fontSize="4xl" fontWeight="700" mb={2} color={c.text}>
            {booking.refNumber}
          </Text>
          <Text color={c.muted}>
            Thank you, {booking.customerName.split(' ')[0]}. Your confirmation
            email is on its way to {booking.customerEmail}.
          </Text>
        </Box>

        {/* ETA for Emergency Bookings */}
        {booking.bookingType === 'emergency' && (
          <Box textAlign="center" p={6} bg="rgba(249,115,22,0.1)" borderRadius="lg">
            <Text color={c.accent} fontWeight="500" mb={1}>
              Estimated Arrival Time
            </Text>
            <EmergencyCountdown
              createdAt={booking.createdAt}
              etaMinutes={etaMinutes}
            />
            <Text fontSize="sm" color={c.muted} mt={2}>
              A driver will be assigned shortly and head to your location
            </Text>
          </Box>
        )}

        {/* Scheduled Time */}
        {booking.bookingType === 'scheduled' && booking.scheduledAt && (
          <Box textAlign="center" p={6} bg={c.surface} borderRadius="lg">
            <Text color={c.muted} fontWeight="500" mb={2}>
              Scheduled Appointment
            </Text>
            <Text fontSize="2xl" fontWeight="700" mb={4} color={c.text}>
              {new Date(booking.scheduledAt).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              <br />
              {new Date(booking.scheduledAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Button colorPalette="orange" onClick={generateICS}>
              Add to Calendar
            </Button>
          </Box>
        )}

        {/* Booking Summary */}
        <Box
          borderWidth="1px"
          borderColor={c.border}
          borderRadius="lg"
          overflow="hidden"
          style={anim.fadeUp('0.6s', '0.2s')}
        >
          <Box p={4} bg={c.surface} borderBottomWidth="1px" borderColor={c.border}>
            <Text fontWeight="600" color={c.text}>Booking Summary</Text>
          </Box>

          <VStack gap={0} align="stretch">
            {/* Service Type */}
            <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.muted}>Service Type</Text>
              <Text fontWeight="500" textTransform="capitalize" color={c.text}>
                {booking.bookingType} - {booking.serviceType}
              </Text>
            </HStack>

            {/* Location */}
            <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.muted}>Location</Text>
              <Text fontWeight="500" textAlign="right" maxW="60%" color={c.text}>
                {booking.addressLine}
              </Text>
            </HStack>

            {/* Tyres */}
            {booking.tyres.length > 0 && (
              <Box p={4} borderBottomWidth="1px" borderColor={c.border}>
                <Text color={c.muted} mb={2}>Tyres</Text>
                <VStack align="stretch" gap={2}>
                  {booking.tyres.map((tyre, index) => (
                    <HStack key={index} justify="space-between">
                      <Box>
                        <Text fontWeight="500" color={c.text}>
                          {tyre.brand} {tyre.pattern}
                        </Text>
                        <Text fontSize="sm" color={c.muted}>
                          {tyre.sizeDisplay} - {tyre.condition} x {tyre.quantity}
                        </Text>
                      </Box>
                      <Text fontWeight="500" color={c.text}>
                        {formatPrice(tyre.unitPrice * tyre.quantity)}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}

            {/* Pricing */}
            <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.muted}>Subtotal</Text>
              <Text color={c.text}>{formatPrice(booking.subtotal)}</Text>
            </HStack>

            <HStack justify="space-between" p={4} borderBottomWidth="1px" borderColor={c.border}>
              <Text color={c.muted}>VAT (20%)</Text>
              <Text color={c.text}>{formatPrice(booking.vatAmount)}</Text>
            </HStack>

            <HStack justify="space-between" p={4} bg={c.accent}>
              <Text fontWeight="600" color={c.bg}>Total Paid</Text>
              <Text fontWeight="700" fontSize="lg" color={c.bg}>
                {formatPrice(booking.totalAmount)}
              </Text>
            </HStack>
          </VStack>
        </Box>

        {/* Tracking Button */}
        <Box style={anim.fadeUp('0.5s', '0.4s')}>
          {isTrackingAvailable ? (
            <Link href={`/tracking/${booking.refNumber}`}>
              <Button colorPalette="orange" width="full" size="lg">
                Track Your Driver
              </Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              width="full"
              size="lg"
              disabled
            >
              Live Tracking - Available Once Driver Assigned
            </Button>
          )}
        </Box>

        {/* Help Links */}
        <VStack gap={2} fontSize="sm" color={c.muted} textAlign="center">
          <Text>
            Questions? Call us on 0141 266 0690
          </Text>
          <Link href="/" style={{ textDecoration: 'underline' }}>
            Return to Homepage
          </Link>
        </VStack>
      </VStack>
    </Container>
  );
}

interface EmergencyCountdownProps {
  createdAt: string;
  etaMinutes: number | null;
}

function EmergencyCountdown({ createdAt, etaMinutes }: EmergencyCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!etaMinutes) return;

    const createdTime = new Date(createdAt).getTime();
    const arrivalTime = createdTime + etaMinutes * 60 * 1000;

    const updateRemaining = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((arrivalTime - now) / 1000 / 60));
      setRemaining(diff);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [createdAt, etaMinutes]);

  if (remaining === null || etaMinutes === null) {
    return (
      <Text fontSize="3xl" fontWeight="700" color={c.accent}>
        Calculating...
      </Text>
    );
  }

  if (remaining === 0) {
    return (
      <Text fontSize="3xl" fontWeight="700" color={c.accent}>
        Arriving now
      </Text>
    );
  }

  return (
    <Text fontSize="3xl" fontWeight="700" color={c.accent}>
      ~{remaining} minutes
    </Text>
  );
}
