export interface CustomerPaymentStatus {
  paymentIntentId: string;
  status: string;
  canResume: boolean;
  clientSecret?: string;
  amountPence: number;
  currency: 'gbp';
}

/** Only an authenticated response for the same intent may unlock another attempt. */
export function validateCustomerPaymentStatus(value: unknown, expectedId: string): CustomerPaymentStatus {
  const result = value as Partial<CustomerPaymentStatus> | null;
  if (!/^pi_[A-Za-z0-9]+$/.test(expectedId) || !result || result.paymentIntentId !== expectedId ||
      typeof result.status !== 'string' || typeof result.canResume !== 'boolean' ||
      !Number.isSafeInteger(result.amountPence) || result.amountPence! <= 0 || result.currency !== 'gbp') {
    throw new Error('This payment needs review by our team. Do not make another payment.');
  }
  if (result.canResume && (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(result.status) ||
      typeof result.clientSecret !== 'string' || !result.clientSecret.startsWith(`${expectedId}_secret_`) ||
      result.clientSecret.length <= `${expectedId}_secret_`.length)) {
    throw new Error('Unable to safely resume this payment. Please contact the team.');
  }
  return result as CustomerPaymentStatus;
}
