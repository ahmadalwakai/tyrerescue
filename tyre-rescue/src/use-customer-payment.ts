export function extractPaymentIntentId(clientSecret: string) {
  return clientSecret.split('_secret_')[0];
}

export function useCustomerPayment() {
  async function prepare() {
    return undefined;
  }

  async function pay() {
    throw new Error('Native Stripe payment is available in the iOS app build.');
  }

  return { prepare, pay };
}
