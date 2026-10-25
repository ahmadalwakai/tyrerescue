'use client';

import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function Providers({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);

  if (!mounted) return <>{children}</>;

  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}
