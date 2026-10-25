/**
 * Decide what a Google sign-in may do. Pure, so the policy is testable
 * without NextAuth or a database.
 *
 * - An email that has no account yet becomes a new customer.
 * - A Google identity already linked to the account signs in.
 * - Linking Google to an existing account by email is only automatic for
 *   customers. Staff (admin/driver) accounts must already have this Google
 *   identity linked; otherwise anyone controlling a Google account with the
 *   same address would gain staff access.
 * - Google must have verified the email address.
 */

export type GoogleSignInDecision = 'allow' | 'link' | 'create' | 'deny';

export function decideGoogleSignIn(input: {
  emailVerifiedByGoogle: boolean;
  existingUser: { role: string } | null;
  /** The Google account currently linked to the existing user, if any. */
  linkedGoogleAccountId: string | null;
  providerAccountId: string;
}): GoogleSignInDecision {
  if (!input.emailVerifiedByGoogle) return 'deny';
  if (!input.existingUser) return 'create';
  if (input.linkedGoogleAccountId) {
    return input.linkedGoogleAccountId === input.providerAccountId ? 'allow' : 'deny';
  }
  return input.existingUser.role === 'customer' ? 'link' : 'deny';
}
