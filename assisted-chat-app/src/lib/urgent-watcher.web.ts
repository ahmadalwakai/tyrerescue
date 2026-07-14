export async function startUrgentWatcher(): Promise<boolean> {
  return false;
}

export async function stopUrgentWatcher(): Promise<void> {
  // no-op on web
}

export async function canUseFullScreenIntent(): Promise<boolean> {
  return true;
}

export async function openFullScreenIntentSettings(): Promise<boolean> {
  return false;
}

export async function setUrgentWatcherAuth(_token: string, _apiBase: string): Promise<boolean> {
  void _token;
  void _apiBase;
  return false;
}

export async function clearUrgentWatcherAuth(): Promise<void> {
  // no-op on web
}
