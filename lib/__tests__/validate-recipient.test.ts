import { describe, it, expect } from 'vitest';
import { validateRecipientEmail } from '../email/validate-recipient';

describe('validateRecipientEmail', () => {
  describe('valid emails', () => {
    it('accepts a normal email address', () => {
      const result = validateRecipientEmail('user@example.org');
      // example.org is blocked domain
      expect(result.ok).toBe(false);
    });

    it('accepts a real customer email', () => {
      const result = validateRecipientEmail('john.doe@gmail.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe('john.doe@gmail.com');
    });

    it('trims whitespace and lowercases', () => {
      const result = validateRecipientEmail('  John.Doe@GMail.COM  ');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe('john.doe@gmail.com');
    });

    it('accepts emails with subdomains', () => {
      const result = validateRecipientEmail('ops@mail.tyrerescue.uk');
      expect(result.ok).toBe(true);
    });

    it('accepts emails with plus addressing', () => {
      const result = validateRecipientEmail('user+tag@example.co.uk');
      // example.co.uk is not blocked
      expect(result.ok).toBe(true);
    });
  });

  describe('null / undefined / non-string', () => {
    it('rejects null', () => {
      const result = validateRecipientEmail(null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/null or undefined/);
    });

    it('rejects undefined', () => {
      const result = validateRecipientEmail(undefined);
      expect(result.ok).toBe(false);
    });

    it('rejects numbers', () => {
      const result = validateRecipientEmail(42);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/not a string/);
    });

    it('rejects objects', () => {
      const result = validateRecipientEmail({ email: 'a@b.com' });
      expect(result.ok).toBe(false);
    });
  });

  describe('empty / whitespace', () => {
    it('rejects empty string', () => {
      const result = validateRecipientEmail('');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/empty or whitespace/);
    });

    it('rejects whitespace-only string', () => {
      const result = validateRecipientEmail('   ');
      expect(result.ok).toBe(false);
    });
  });

  describe('invalid format', () => {
    it('rejects missing @', () => {
      const result = validateRecipientEmail('notanemail');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/format/);
    });

    it('rejects missing domain part', () => {
      const result = validateRecipientEmail('user@');
      expect(result.ok).toBe(false);
    });

    it('rejects missing local part', () => {
      const result = validateRecipientEmail('@domain.com');
      expect(result.ok).toBe(false);
    });
  });

  describe('blocked domains', () => {
    it('rejects example.com', () => {
      const result = validateRecipientEmail('user@example.com');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/example\.com/);
    });

    it('rejects example.org', () => {
      const result = validateRecipientEmail('user@example.org');
      expect(result.ok).toBe(false);
    });

    it('rejects example.net', () => {
      const result = validateRecipientEmail('user@example.net');
      expect(result.ok).toBe(false);
    });

    it('rejects test.com', () => {
      const result = validateRecipientEmail('user@test.com');
      expect(result.ok).toBe(false);
    });

    it('rejects localhost as domain', () => {
      const result = validateRecipientEmail('user@localhost');
      expect(result.ok).toBe(false);
    });
  });

  describe('blocked local parts (placeholder addresses)', () => {
    it('rejects phone-booking@tyrerescue.uk (walk-in placeholder)', () => {
      const result = validateRecipientEmail('phone-booking@tyrerescue.uk');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/placeholder/);
    });

    it('rejects noemail@any.domain', () => {
      const result = validateRecipientEmail('noemail@gmail.com');
      expect(result.ok).toBe(false);
    });

    it('rejects none@any.domain', () => {
      const result = validateRecipientEmail('none@gmail.com');
      expect(result.ok).toBe(false);
    });

    it('rejects noop@any.domain', () => {
      const result = validateRecipientEmail('noop@domain.co.uk');
      expect(result.ok).toBe(false);
    });

    it('rejects donotreply@any.domain', () => {
      const result = validateRecipientEmail('donotreply@company.com');
      expect(result.ok).toBe(false);
    });

    it('rejects do-not-reply@any.domain', () => {
      const result = validateRecipientEmail('do-not-reply@company.com');
      expect(result.ok).toBe(false);
    });

    it('rejects no-reply@any.domain', () => {
      const result = validateRecipientEmail('no-reply@company.com');
      expect(result.ok).toBe(false);
    });

    it('rejects invalid@any.domain', () => {
      const result = validateRecipientEmail('invalid@somewhere.com');
      expect(result.ok).toBe(false);
    });

    it('rejects n/a@any.domain (blocked local part)', () => {
      // n/a is not a valid email address anyway; format check will catch it first
      const result = validateRecipientEmail('n/a@domain.com');
      expect(result.ok).toBe(false);
    });

    it('is case-insensitive for local parts', () => {
      const result = validateRecipientEmail('PHONE-BOOKING@tyrerescue.uk');
      expect(result.ok).toBe(false);
    });
  });
});
