import type { Order, PaymentMethod } from "@caracol/shared";
import { apiGet, apiPost } from "./apiClient.js";

export interface CreateCheckoutInput {
  addressId?: string;
  shippingMethod: "pickup" | "home";
  paymentMethod?: PaymentMethod;
  expectedShippingCost: number;
  notes?: string;
}

export interface CheckoutResult {
  order: Order;
  /** `null` en una transferencia: no hay a dónde redirigir, se muestran los datos para transferir. */
  checkoutUrl: string | null;
}

export interface PaymentOptions {
  mercadoPago: boolean;
  transfer: boolean;
}

export const getPaymentOptions = () => apiGet<PaymentOptions>("/checkout/payment-options");

export const createCheckout = (input: CreateCheckoutInput) =>
  apiPost<CheckoutResult>("/checkout", input);
