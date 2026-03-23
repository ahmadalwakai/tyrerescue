/**
 * Quick Book Location Sharing Message Templates
 * 
 * Beautiful, professional templates for sharing location links with customers
 * via WhatsApp, SMS, Email, or copy-to-clipboard.
 */

export interface LocationMessageContext {
  customerName: string;
  locationLink: string;
  serviceType?: 'fit' | 'repair' | 'assess';
  expiryHours?: number;
}

const SERVICE_LABELS: Record<string, string> = {
  fit: 'mobile tyre fitting',
  repair: 'tyre repair',
  assess: 'vehicle assessment',
};

/**
 * Get first name from full name
 */
function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || 'there';
}

/**
 * Format service type for display
 */
function formatServiceType(serviceType?: string): string {
  if (!serviceType) return 'mobile tyre service';
  return SERVICE_LABELS[serviceType] || 'mobile tyre service';
}

/**
 * WhatsApp message template - concise and mobile-friendly
 */
export function buildLocationWhatsAppMessage(ctx: LocationMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const service = formatServiceType(ctx.serviceType);
  const expiry = ctx.expiryHours ?? 2;

  return `Hi ${firstName} 👋

This is Tyre Rescue. To send our technician directly to you for your ${service}, please tap the link below to share your location:

📍 ${ctx.locationLink}

The link is valid for ${expiry} hours. Once you share your location, we'll have your technician on the way!

Reply to this message if you have any questions.

Thanks,
Tyre Rescue 🛞`;
}

/**
 * SMS message template - shorter for SMS character limits
 */
export function buildLocationSmsMessage(ctx: LocationMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const expiry = ctx.expiryHours ?? 2;

  return `Hi ${firstName}, Tyre Rescue here! Please tap this link to share your location so our technician can find you: ${ctx.locationLink} (valid ${expiry}hrs)`;
}

/**
 * Email subject line
 */
export function buildLocationEmailSubject(ctx: LocationMessageContext): string {
  return `Tyre Rescue - Please Share Your Location`;
}

/**
 * Email body template - professional and detailed
 */
export function buildLocationEmailBody(ctx: LocationMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const service = formatServiceType(ctx.serviceType);
  const expiry = ctx.expiryHours ?? 2;

  return `Hi ${firstName},

Thank you for choosing Tyre Rescue for your ${service}.

To help our technician find you quickly, please tap the button below to share your location:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 SHARE YOUR LOCATION
${ctx.locationLink}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

How it works:
1. Tap the link above
2. Allow your browser to access your location
3. Your GPS coordinates are securely shared with us
4. Our technician will be dispatched to your exact location

This link expires in ${expiry} hours.

If you're having trouble, simply reply to this email and we'll help you out.

Thanks,
The Tyre Rescue Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 0141 266 0690
🌐 www.tyrerescue.uk
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Plain text template for clipboard (used when copying to paste elsewhere)
 */
export function buildLocationCopyMessage(ctx: LocationMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const service = formatServiceType(ctx.serviceType);
  const expiry = ctx.expiryHours ?? 2;

  return `Hi ${firstName},

Tyre Rescue here! To help us find you for your ${service}, please tap this link to share your location:

${ctx.locationLink}

This link expires in ${expiry} hours.

Thanks,
Tyre Rescue
0141 266 0690`;
}

/**
 * Build WhatsApp URL with pre-filled message
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  // Clean phone number - remove spaces, dashes, and ensure it starts with country code
  let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  
  // If starts with 0, replace with UK country code
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '44' + cleanPhone.slice(1);
  }
  
  // If doesn't start with +, add it (but WhatsApp URL uses no +)
  if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.slice(1);
  }
  
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Build SMS URL (for mobile browsers)
 */
export function buildSmsUrl(phone: string, message: string): string {
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

/**
 * Build mailto URL with subject and body
 */
export function buildEmailUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Get all message templates for a given context
 */
export function getAllLocationMessages(ctx: LocationMessageContext) {
  return {
    whatsapp: buildLocationWhatsAppMessage(ctx),
    sms: buildLocationSmsMessage(ctx),
    emailSubject: buildLocationEmailSubject(ctx),
    emailBody: buildLocationEmailBody(ctx),
    copy: buildLocationCopyMessage(ctx),
  };
}

// ─── Booking Lifecycle SMS Templates ────────────────────

export interface BookingConfirmationSmsContext {
  customerName: string;
  refNumber: string;
  trackingUrl: string;
}

export function buildBookingConfirmationSmsMessage(ctx: BookingConfirmationSmsContext): string {
  const firstName = getFirstName(ctx.customerName);
  return `Tyre Rescue — Ref ${ctx.refNumber}. Hi ${firstName}, your booking is confirmed! Track your technician here: ${ctx.trackingUrl}`;
}

export interface TrackingSmsContext {
  customerName: string;
  refNumber: string;
  trackingUrl: string;
}

export function buildTrackingSmsMessage(ctx: TrackingSmsContext): string {
  const firstName = getFirstName(ctx.customerName);
  return `Hi ${firstName}, your Tyre Rescue technician is on the way! Track live: ${ctx.trackingUrl} (Ref ${ctx.refNumber})`;
}
