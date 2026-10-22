const PREFIX = 'tyrerescue.customer.';

function storage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export async function getSecureItem(key: string) {
  return storage()?.getItem(`${PREFIX}${key}`) ?? null;
}

export async function setSecureItem(key: string, value: string) {
  storage()?.setItem(`${PREFIX}${key}`, value);
}

export async function deleteSecureItem(key: string) {
  storage()?.removeItem(`${PREFIX}${key}`);
}
