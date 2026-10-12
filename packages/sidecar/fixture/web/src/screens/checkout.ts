import { placeOrder } from '../api/orders-client';

export const submitCheckout = async (cart: { sku: string; quantity: number }[]) => {
  const order = await placeOrder(cart);
  return order.id;
};
