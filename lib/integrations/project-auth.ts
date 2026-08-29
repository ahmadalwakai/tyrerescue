import type { ProjectSource } from './project-sources';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getSecretForSource(source: ProjectSource): string {
  return (
    process.env[source.secretEnv] ??
    process.env.PROJECT_INTEGRATIONS_SECRET ??
    ''
  ).trim();
}

export function isAuthorizedProjectIntegrationRequest(request: Request, source: ProjectSource): boolean {
  const secret = getSecretForSource(source);
  if (!secret) return false;

  const provided = (request.headers.get('x-integration-key') ?? '').trim();
  if (!provided) return false;

  return constantTimeEqual(provided, secret);
}
