import { z } from 'zod';

export type EmailValidationResult =
  | { ok: true; email: string }
  | { ok: false; reason: string };

// نطاقات محجوبة — وهمية أو مؤقتة، لا نرسل إليها أبداً
const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'localhost',
]);

// أجزاء محلية محجوبة تُشير إلى عناوين placeholder داخلية
// مثال: phone-booking@tyrerescue.uk هو عنوان مؤقت لعملاء walk-in بلا بريد حقيقي
const BLOCKED_LOCAL_PARTS = new Set([
  'phone-booking',
  'noemail',
  'none',
  'n/a',
  'invalid',
  'noop',
  'donotreply',
  'do-not-reply',
  'no-reply',
]);

const emailSchema = z.string().email();

/**
 * Validates a recipient email before any Zepto Mail call.
 *
 * يتحقق من عنوان البريد الإلكتروني للمستلم قبل أي إرسال عبر Zepto Mail.
 * الإرجاع: { ok: true, email } — بريد سليم (مُقلَّص ومُحوَّل للأحرف الصغيرة)
 *         { ok: false, reason } — بريد غير صالح مع سبب واضح
 *
 * ملاحظة: إذا احتاج المشروع لاحقاً إلى قائمة حظر دائمة (bounce suppression)
 * من قاعدة البيانات، أضف migration وارجع هنا لاستشارة تلك القائمة.
 */
export function validateRecipientEmail(input: unknown): EmailValidationResult {
  if (input == null) {
    return { ok: false, reason: 'Email is null or undefined' };
  }

  if (typeof input !== 'string') {
    return { ok: false, reason: 'Email is not a string' };
  }

  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    return { ok: false, reason: 'Email is empty or whitespace' };
  }

  const parsed = emailSchema.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, reason: 'Email format is invalid' };
  }

  const atIdx = trimmed.indexOf('@');
  const localPart = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  if (BLOCKED_DOMAINS.has(domain)) {
    return { ok: false, reason: `Email domain '${domain}' is not a valid recipient domain` };
  }

  if (BLOCKED_LOCAL_PARTS.has(localPart)) {
    return { ok: false, reason: 'Email is a placeholder or internal system address' };
  }

  return { ok: true, email: trimmed };
}
