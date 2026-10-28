/** Configuración de precios del negocio, editable desde el admin. */
export interface PricingSettings {
  /** Margen (%) sobre el costo para calcular el precio de venta. */
  marginPercent: number;
  /** Paso de redondeo hacia arriba del precio calculado, en centavos ($100 = 10000). */
  roundingStep: number;
  /**
   * Si es true, registrar una compra a proveedor recalcula el precio de venta de cada variante
   * comprada. Apagado por defecto: un precio cargado a mano no debería cambiar solo.
   */
  autoPriceOnPurchase: boolean;
}

/** Datos de la cuenta donde el cliente hace la transferencia. */
export interface TransferSettings {
  enabled: boolean;
  accountHolder: string;
  bankName: string;
  /** CBU o CVU (22 dígitos). */
  cbu: string;
  alias: string;
  /** CUIT/CUIL del titular. */
  taxId: string;
  /** Texto libre que se le muestra al cliente (por ejemplo, qué poner en el concepto). */
  instructions: string;
}

/** Lo que ve el cliente de un pedido pagado por transferencia: a dónde, cuánto y hasta cuándo. */
export interface TransferInstructions {
  transfer: TransferSettings;
  orderNumber: number;
  amount: number;
  /** Si no sube un comprobante antes de esta fecha, el pedido se cancela y se repone el stock. */
  expiresAt?: string;
  receiptUrl?: string;
  paymentStatus: "pending" | "approved" | "rejected" | "refunded" | "cancelled";
}

export interface StoreSettings {
  pricing: PricingSettings;
  transfer: TransferSettings;
}
