import { useCallback, useLayoutEffect, useRef } from 'react';
import { getAdminToken, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';

/** A confirmation or response may only act in the workspace that opened it. */
export function useBonlineRequestScope(enabled: boolean, key = '') {
  const scopeKey = `${getApiContextRevision()}:${getAdminSessionRevision()}:${key}`;
  const enabledRef = useRef(enabled);
  const generationRef = useRef(0);

  useLayoutEffect(() => {
    enabledRef.current = enabled;
    generationRef.current += 1;
    return () => {
      enabledRef.current = false;
      generationRef.current += 1;
    };
  }, [enabled, scopeKey]);

  const captureScope = useCallback(() => ({
    generation: generationRef.current,
    apiRevision: getApiContextRevision(),
    sessionRevision: getAdminSessionRevision(),
    token: getAdminToken(),
  }), []);

  const isCurrent = useCallback((scope: ReturnType<typeof captureScope>) => (
    enabledRef.current && Boolean(scope.token)
    && scope.generation === generationRef.current
    && scope.apiRevision === getApiContextRevision()
    && scope.sessionRevision === getAdminSessionRevision()
    && scope.token === getAdminToken()
  ), []);

  return { scopeKey, captureScope, isCurrent };
}
