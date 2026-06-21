import type { SelectedTyre } from './types';

export function addToCart(cart: SelectedTyre[], tyre: Omit<SelectedTyre, 'quantity'>, qty = 1) {
  const existing = cart.find((item) => item.tyreId === tyre.tyreId);
  if (existing) {
    return cart.map((item) =>
      item.tyreId === tyre.tyreId
        ? { ...item, quantity: Math.min(item.quantity + qty, 4) }
        : item,
    );
  }
  const total = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (total + qty > 4) return cart;
  return [...cart, { ...tyre, quantity: qty }];
}

export function updateCartQuantity(cart: SelectedTyre[], tyreId: string, quantity: number) {
  if (quantity <= 0) return cart.filter((item) => item.tyreId !== tyreId);
  const otherTotal = cart
    .filter((item) => item.tyreId !== tyreId)
    .reduce((sum, item) => sum + item.quantity, 0);
  const clamped = Math.min(quantity, 4 - otherTotal);
  if (clamped <= 0) return cart;
  return cart.map((item) => (item.tyreId === tyreId ? { ...item, quantity: clamped } : item));
}

export function cartItemCount(cart: SelectedTyre[]) {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}
