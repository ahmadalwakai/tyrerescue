import { rewriteStripeRedirectPath } from '../src/customer-payment-redirect';

export function redirectSystemPath(event: { path: string; initial: boolean }): string {
  return rewriteStripeRedirectPath(event);
}
