import type { OrderStatus, PaymentStatus } from "@caracol/shared";
import { hideItemCost } from "../utils/hideItemCost.js";
import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];
const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "approved", "rejected", "refunded", "cancelled"];

/** Snapshot inmutable de la variante al momento de compra. */
export interface IOrderItem {
  product: Types.ObjectId;
  productName: string;
  variantSku: string;
  variantLabel: string;
  image?: string;
  unitPrice: number;
  /**
   * Costo de la variante al momento de la venta, para que el margen histórico no cambie cuando
   * cambia el costo. Dato interno: NUNCA sale por la API (ver el `toJSON` del schema); solo lo lee
   * el servicio de reportes. Puede faltar en pedidos viejos.
   */
  unitCost?: number;
  quantity: number;
  subtotal: number;
}

export interface IOrderStatusHistoryEntry {
  status: OrderStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId;
  note?: string;
}

/**
 * Se levanta cuando llega un pago aprobado para un pedido que ya está
 * cancelado (por vencimiento o por un admin). Un admin debe resolverlo a
 * mano: reactivar el pedido (si hay stock) o devolver la plata.
 */
export interface IOrderPaymentIssue {
  reason: "approved_on_cancelled";
  paymentId: string;
  flaggedAt: Date;
  resolvedAt?: Date;
  resolution?: "reactivated" | "refunded";
}

export interface IShippingAddressSnapshot {
  label?: string;
  street: string;
  number?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone?: string;
}

/** Detalle de la cotización de envío por correo (Correo Argentino), guardado al confirmar la orden. */
export interface IOrderShippingDetails {
  carrier: string;
  service?: string;
  etaMinDays?: number;
  etaMaxDays?: number;
  quotedAt: Date;
  carrierImportedAt?: Date;
  isFallback?: boolean;
  packageWeight?: number;
  packageHeight?: number;
  packageWidth?: number;
  packageLength?: number;
}

export interface IOrder {
  orderNumber: number;
  customer: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  statusHistory: IOrderStatusHistoryEntry[];
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  /** Cuándo se cobró (se aprobó el pago). Los reportes cuentan la venta ese día, no el de la compra. */
  paidAt?: Date;
  /**
   * Claves usadas: `preferenceId`, `initPoint` y `expiresAt` (link de pago
   * vigente) y `paymentId`, `mpStatus`, `mpStatusDetail` (última
   * notificación de Mercado Pago procesada).
   */
  paymentDetails?: Record<string, unknown>;
  paymentIssue?: IOrderPaymentIssue;
  shippingMethod: string;
  /** Ausente cuando `shippingMethod` es "pickup": el retiro en el local no exige dirección. */
  shippingAddress?: IShippingAddressSnapshot;
  shippingDetails?: IOrderShippingDetails;
  trackingNumber?: string;
  notes?: string;
  receiptUrl?: string;
}

export type OrderDocument = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    variantSku: { type: String, required: true },
    variantLabel: { type: String, default: "" },
    image: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSnapshotSchema = new Schema<IShippingAddressSnapshot>(
  {
    label: { type: String },
    street: { type: String, required: true },
    number: { type: String },
    city: { type: String, required: true },
    province: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String },
  },
  { _id: false },
);

const shippingDetailsSchema = new Schema<IOrderShippingDetails>(
  {
    carrier: { type: String, required: true },
    service: { type: String },
    etaMinDays: { type: Number },
    etaMaxDays: { type: Number },
    quotedAt: { type: Date, required: true, default: () => new Date() },
    carrierImportedAt: { type: Date },
    isFallback: { type: Boolean },
    packageWeight: { type: Number },
    packageHeight: { type: Number },
    packageWidth: { type: Number },
    packageLength: { type: Number },
  },
  { _id: false },
);

const statusHistoryEntrySchema = new Schema<IOrderStatusHistoryEntry>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    changedAt: { type: Date, required: true, default: () => new Date() },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String },
  },
  { _id: false },
);

const paymentIssueSchema = new Schema<IOrderPaymentIssue>(
  {
    reason: { type: String, enum: ["approved_on_cancelled"], required: true },
    paymentId: { type: String, required: true },
    flaggedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date },
    resolution: { type: String, enum: ["reactivated", "refunded"] },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: Number, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: { validator: (v: IOrderItem[]) => v.length > 0, message: "La orden debe tener al menos un ítem" },
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingCost: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    paidAt: { type: Date },
    paymentDetails: { type: Schema.Types.Mixed },
    paymentIssue: { type: paymentIssueSchema },
    shippingMethod: { type: String, required: true },
    shippingAddress: { type: shippingAddressSnapshotSchema },
    shippingDetails: { type: shippingDetailsSchema },
    trackingNumber: { type: String },
    notes: { type: String },
    receiptUrl: { type: String },
  },
  { timestamps: true, toJSON: { transform: hideItemCost } },
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: 1 });

export const Order = (mongoose.models.Order as Model<IOrder>) ?? model<IOrder>("Order", orderSchema);
