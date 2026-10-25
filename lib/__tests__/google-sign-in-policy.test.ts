import { describe, it, expect } from 'vitest';
import { decideGoogleSignIn } from '@/lib/auth/google-link';

const base = { emailVerifiedByGoogle: true, providerAccountId: 'g-123' };

describe('decideGoogleSignIn', () => {
  it('creates a customer for a new email', () => {
    expect(decideGoogleSignIn({ ...base, existingUser: null, linkedGoogleAccountId: null })).toBe('create');
  });

  it('links Google to an existing customer on first use', () => {
    expect(decideGoogleSignIn({ ...base, existingUser: { role: 'customer' }, linkedGoogleAccountId: null })).toBe('link');
  });

  it.each(['admin', 'driver'])('never auto-links Google to an existing %s account', (role) => {
    expect(decideGoogleSignIn({ ...base, existingUser: { role }, linkedGoogleAccountId: null })).toBe('deny');
  });

  it.each(['admin', 'driver', 'customer'])('lets a %s sign in with the Google identity already linked', (role) => {
    expect(decideGoogleSignIn({ ...base, existingUser: { role }, linkedGoogleAccountId: 'g-123' })).toBe('allow');
  });

  it('rejects a different Google identity than the one linked', () => {
    expect(decideGoogleSignIn({ ...base, existingUser: { role: 'customer' }, linkedGoogleAccountId: 'g-999' })).toBe('deny');
  });

  it('rejects emails Google has not verified', () => {
    expect(decideGoogleSignIn({ ...base, emailVerifiedByGoogle: false, existingUser: null, linkedGoogleAccountId: null })).toBe('deny');
  });
});
