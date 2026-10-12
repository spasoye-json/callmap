export const placeOrder = async (cart: { sku: string; quantity: number }[]) => {
  const response = await fetch('/orders', { method: 'POST', body: JSON.stringify({ cart }) });
  return (await response.json()) as { id: string };
};
