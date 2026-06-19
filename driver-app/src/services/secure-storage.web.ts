const WEB_KEY_PREFIX = 'tyrerescue-driver:';
const memoryStore = new Map<string, string>();

function webKey(key: string): string {
  return `${WEB_KEY_PREFIX}${key}`;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  const localStorage = getLocalStorage();
  if (localStorage) {
    return localStorage.getItem(webKey(key));
  }
  return memoryStore.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  const localStorage = getLocalStorage();
  if (localStorage) {
    localStorage.setItem(webKey(key), value);
    return;
  }
  memoryStore.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  const localStorage = getLocalStorage();
  if (localStorage) {
    localStorage.removeItem(webKey(key));
    return;
  }
  memoryStore.delete(key);
}
