import { createContext, useContext } from "react";
import type { CartView } from "@/types/cart";

// El contexto y el hook viven aparte del provider (CartContext.tsx) para que el
// fast refresh funcione: un archivo de componentes solo exporta componentes.

export interface AddCartItemInput {
  productId: string;
  variantSku: string;
  quantity: number;
  name: string;
  slug: string;
  image?: string;
  variantLabel: string;
  unitPrice: number;
  availableStock: number;
}

export interface CartContextValue {
  cart: CartView;
  isLoading: boolean;
  addItem: (input: AddCartItemInput) => Promise<void>;
  updateQuantity: (productId: string, variantSku: string, quantity: number) => Promise<void>;
  removeItem: (productId: string, variantSku: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
