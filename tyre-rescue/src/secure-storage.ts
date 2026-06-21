export async function getSecureItem(key: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`tyrerescue.customer.${key}`);
}

export async function setSecureItem(key: string, value: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`tyrerescue.customer.${key}`, value);
  }
}

export async function deleteSecureItem(key: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(`tyrerescue.customer.${key}`);
  }
}
