import { useEffect, useState } from 'react';

// A route parameter is accepted when the link arrives, not again when an
// account signs out. A newly opened link can establish a new scoped proof.
export function useBookingParamAccess(input: string, revision: number) {
  const [received, setReceived] = useState(() => ({ input, revision }));
  useEffect(() => {
    setReceived((previous) => previous.input === input ? previous : { input, revision });
  }, [input, revision]);
  return {
    value: received.input === input && received.revision === revision ? input : '',
    invalidated: Boolean(input && received.input === input && received.revision !== revision),
  };
}
