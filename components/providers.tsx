'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { system } from '@/lib/theme';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ChakraProvider value={system}>
        {children}
      </ChakraProvider>
    </SessionProvider>
  );
}
