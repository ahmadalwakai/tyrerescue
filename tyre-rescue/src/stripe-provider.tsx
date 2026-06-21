import type { ReactElement } from 'react';

export function CustomerStripeProvider({ children }: { children: ReactElement | ReactElement[] }) {
  return <>{children}</>;
}
