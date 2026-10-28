import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";

export interface ISupplier {
  name: string;
  /** CUIT. */
  taxId: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
}

export type SupplierDocument = HydratedDocument<ISupplier>;

const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true },
    taxId: { type: String, default: "", trim: true },
    contactName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    address: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.index({ name: 1 });

export const Supplier =
  (mongoose.models.Supplier as Model<ISupplier>) ?? model<ISupplier>("Supplier", supplierSchema);
