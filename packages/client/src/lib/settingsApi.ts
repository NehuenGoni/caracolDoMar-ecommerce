import type { PricingSettings, StoreSettings, TransferSettings } from "@caracol/shared";
import { apiGet, apiPut } from "./apiClient.js";

export const getSettings = () => apiGet<{ settings: StoreSettings }>("/admin/settings");

export const updatePricingSettings = (input: PricingSettings) =>
  apiPut<{ settings: StoreSettings }>("/admin/settings/pricing", input);

export const updateTransferSettings = (input: TransferSettings) =>
  apiPut<{ settings: { transfer: TransferSettings } }>("/admin/settings/transfer", input);
