import type {
  AnnouncementSettings,
  PricingSettings,
  PublicAnnouncement,
  StoreSettings,
  TransferSettings,
} from "@caracol/shared";
import { apiGet, apiPut } from "./apiClient.js";

export const getSettings = () => apiGet<{ settings: StoreSettings }>("/admin/settings");

export const updatePricingSettings = (input: PricingSettings) =>
  apiPut<{ settings: StoreSettings }>("/admin/settings/pricing", input);

export const updateTransferSettings = (input: TransferSettings) =>
  apiPut<{ settings: { transfer: TransferSettings } }>("/admin/settings/transfer", input);

export const updateAnnouncementSettings = (input: AnnouncementSettings) =>
  apiPut<{ settings: { announcement: AnnouncementSettings } }>("/admin/settings/announcement", input);

/** Público: el aviso vigente de la tienda, o `null`. */
export const getPublicAnnouncement = () => apiGet<{ announcement: PublicAnnouncement | null }>("/settings/announcement");
