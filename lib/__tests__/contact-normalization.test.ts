import { describe, expect, it } from 'vitest';
import { normalizeRecipientEmailInput } from '../contact-normalization';
import { validateRecipientEmail } from '../email/validate-recipient';
import { normalizeUkPhoneNumber } from '../voodoo-sms';
import { getEmailDomainSuggestions } from '../../assisted-chat-app/src/lib/money';

describe('contact normalization', () => {
  it('accepts common UK mobile formats before SMS validation', () => {
    expect(normalizeUkPhoneNumber('07786 123 456')).toBe('447786123456');
    expect(normalizeUkPhoneNumber('+44 7786 123456')).toBe('447786123456');
    expect(normalizeUkPhoneNumber('0044 7786 123456')).toBe('447786123456');
    expect(normalizeUkPhoneNumber('+44 (0) 7786 123456')).toBe('447786123456');
  });

  it('does not treat UK landlines as SMS-capable mobile numbers', () => {
    expect(normalizeUkPhoneNumber('0141 266 0690')).toBeNull();
  });

  it('cleans pasted customer email addresses before validation', () => {
    expect(normalizeRecipientEmailInput(' Customer Name <USER.Name+tyre@Gmail.com>\u200B ')).toBe(
      'user.name+tyre@gmail.com',
    );
    expect(validateRecipientEmail(' Customer Name <USER.Name+tyre@Gmail.com>\u200B ')).toEqual({
      ok: true,
      email: 'user.name+tyre@gmail.com',
    });
  });

  it('suggests common email domains while the operator types', () => {
    expect(getEmailDomainSuggestions('customer@gm')).toContain('customer@gmail.com');
    expect(getEmailDomainSuggestions('customer@')).toEqual([
      'customer@gmail.com',
      'customer@hotmail.com',
      'customer@outlook.com',
      'customer@icloud.com',
    ]);
    expect(getEmailDomainSuggestions('customer@gmail.com')).toEqual([]);
  });
});
