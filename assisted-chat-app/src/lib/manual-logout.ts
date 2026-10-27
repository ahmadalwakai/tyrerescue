/** Notification cleanup must not prevent an explicit sign-out during an outage. */
export async function completeManualLogout(
  cleanup: () => Promise<unknown>,
  logout: () => Promise<void>,
  timeoutMs = 8_000,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => isCurrent() ? cleanup() : undefined).catch(() => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A delayed click must never sign out a newer login or another workspace.
    if (isCurrent()) await logout();
  }
}
