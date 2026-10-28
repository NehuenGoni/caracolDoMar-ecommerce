import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

export interface ISupplierPurchaseItem {
  product: Types.ObjectId;
  variantSku: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ISupplierPurchase {
  /** Proveedor registrado (opcional: hay compras cargadas solo con el nombre). */
  supplier?: Types.ObjectId;
  /** Nombre del proveedor al momento de la compra. */
  supplierName: string;
  items: ISupplierPurchaseItem[];
  totalCost: number;
  purchaseDate: Date;
  notes?: string;
  /** Clave que genera el cliente: reintentar el mismo envío no duplica la compra ni el stock. */
  idempotencyKey?: string;
  createdBy: Types.ObjectId;
}

export type SupplierPurchaseDocument = HydratedDocument<ISupplierPurchase>;

const supplierPurchaseItemSchema = new Schema<ISupplierPurchaseItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantSku: { type: String, required: true, uppercase: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const supplierPurchaseSchema = new Schema<ISupplierPurchase>(
  {
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier" },
    supplierName: { type: String, required: true, trim: true },
    items: {
      type: [supplierPurchaseItemSchema],
      required: true,
      validate: {
        validator: (v: ISupplierPurchaseItem[]) => v.length > 0,
        message: "La compra debe tener al menos un ítem",
      },
    },
    totalCost: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, required: true, default: () => new Date() },
    notes: { type: String },
    idempotencyKey: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

supplierPurchaseSchema.index({ purchaseDate: -1 });
supplierPurchaseSchema.index({ supplier: 1, purchaseDate: -1 });
// Parcial (solo cuando hay clave): las compras sin clave no chocan entre sí.
supplierPurchaseSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

export const SupplierPurchase =
  (mongoose.models.SupplierPurchase as Model<ISupplierPurchase>) ??
  model<ISupplierPurchase>("SupplierPurchase", supplierPurchaseSchema);
