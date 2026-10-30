import type { AnnouncementSettings, PricingSettings, PublicAnnouncement, TransferSettings } from "@caracol/shared";
import { env } from "../config/env.js";
import { StoreSettings } from "../models/StoreSettings.js";
import { dayKey } from "../utils/reportDates.js";
import type {
  UpdateAnnouncementSettingsInput,
  UpdatePricingSettingsInput,
  UpdateTransferSettingsInput,
} from "../validators/settingsValidators.js";

/**
 * Valores iniciales: lo que dice el .env hasta que el admin guarda su propia configuración.
 * El precio automático arranca apagado: registrar una compra no debería cambiar solo los
 * precios que se cargaron a mano.
 */
function pricingDefaults(): PricingSettings {
  return {
    marginPercent: env.DEFAULT_MARGIN_PCT,
    roundingStep: env.PRICE_ROUNDING_STEP,
    autoPriceOnPurchase: false,
  };
}

/** Configuración de precios vigente: la guardada por el admin o, si no hay, la de los defaults. */
export async function getPricingSettings(): Promise<PricingSettings> {
  const doc = await StoreSettings.findOne({ key: "default" }).lean();
  // El documento puede existir con solo la parte de transferencia guardada.
  if (doc?.pricing?.marginPercent === undefined) return pricingDefaults();
  const { marginPercent, roundingStep, autoPriceOnPurchase } = doc.pricing;
  return { marginPercent, roundingStep, autoPriceOnPurchase };
}

export async function updatePricingSettings(input: UpdatePricingSettingsInput): Promise<PricingSettings> {
  await StoreSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { pricing: input } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return getPricingSettings();
}

const TRANSFER_DEFAULTS: TransferSettings = {
  enabled: false,
  accountHolder: "",
  bankName: "",
  cbu: "",
  alias: "",
  taxId: "",
  instructions: "",
};

/** Datos de la cuenta para transferencias. Apagado hasta que el admin lo configure. */
export async function getTransferSettings(): Promise<TransferSettings> {
  const doc = await StoreSettings.findOne({ key: "default" }).lean();
  return { ...TRANSFER_DEFAULTS, ...(doc?.transfer ?? {}) };
}

export async function updateTransferSettings(input: UpdateTransferSettingsInput): Promise<TransferSettings> {
  await StoreSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { transfer: input } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return getTransferSettings();
}

const ANNOUNCEMENT_DEFAULTS: AnnouncementSettings = { enabled: false, text: "", until: null };

export async function getAnnouncementSettings(): Promise<AnnouncementSettings> {
  const doc = await StoreSettings.findOne({ key: "default" }).lean();
  const saved = doc?.announcement;
  return saved ? { enabled: saved.enabled, text: saved.text, until: saved.until ?? null } : ANNOUNCEMENT_DEFAULTS;
}

export async function updateAnnouncementSettings(input: UpdateAnnouncementSettingsInput): Promise<AnnouncementSettings> {
  await StoreSettings.findOneAndUpdate(
    { key: "default" },
    { $set: { announcement: input } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  return getAnnouncementSettings();
}

/** El aviso que se muestra en la tienda: prendido, con texto y sin vencer (el día `until` todavía va). */
export async function getPublicAnnouncement(now: Date = new Date()): Promise<PublicAnnouncement | null> {
  const { enabled, text, until } = await getAnnouncementSettings();
  if (!enabled || !text) return null;
  if (until && until < dayKey(now)) return null;
  return { text };
}
