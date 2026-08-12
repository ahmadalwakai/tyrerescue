const PREFIX = 'tyrerescue-stock:';
const memory = new Map<string, string>();

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  const store = storage();
  return store?.getItem(`${PREFIX}${key}`) ?? memory.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  const store = storage();
  if (store) {
    store.setItem(`${PREFIX}${key}`, value);
    return;
  }
  memory.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  const store = storage();
  if (store) {
    store.removeItem(`${PREFIX}${key}`);
    return;
  }
  memory.delete(key);
}
