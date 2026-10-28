import mongoose, { Schema, model, type Model } from "mongoose";

export interface IStoreSettings {
  /** Singleton: siempre "default". El índice único garantiza un único documento. */
  key: string;
  pricing: {
    marginPercent: number;
    roundingStep: number;
    autoPriceOnPurchase: boolean;
  };
  transfer?: {
    enabled: boolean;
    accountHolder: string;
    bankName: string;
    cbu: string;
    alias: string;
    taxId: string;
    instructions: string;
  };
}

const storeSettingsSchema = new Schema<IStoreSettings>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    pricing: {
      marginPercent: { type: Number, required: true, min: 0 },
      roundingStep: { type: Number, required: true, min: 1 },
      autoPriceOnPurchase: { type: Boolean, required: true },
    },
    transfer: {
      enabled: { type: Boolean, default: false },
      accountHolder: { type: String, default: "", trim: true },
      bankName: { type: String, default: "", trim: true },
      cbu: { type: String, default: "", trim: true },
      alias: { type: String, default: "", trim: true },
      taxId: { type: String, default: "", trim: true },
      instructions: { type: String, default: "", trim: true },
    },
  },
  { timestamps: true },
);

export const StoreSettings =
  (mongoose.models.StoreSettings as Model<IStoreSettings>) ??
  model<IStoreSettings>("StoreSettings", storeSettingsSchema);
