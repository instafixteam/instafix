// utils/cartStorage.js
const carts = new Map();

export function getUserCart(uid) {
  if (!carts.has(uid)) carts.set(uid, {});
  return carts.get(uid);
}

export function setUserCart(uid, cart) {
  carts.set(uid, cart);
}

export function clearUserCart(uid) {
  carts.set(uid, {});
}

export default {
  getUserCart,
  setUserCart,
  clearUserCart
};