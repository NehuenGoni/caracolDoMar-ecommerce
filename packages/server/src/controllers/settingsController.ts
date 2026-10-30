import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as settingsService from "../services/settingsService.js";
import type {
  UpdateAnnouncementSettingsInput,
  UpdatePricingSettingsInput,
  UpdateTransferSettingsInput,
} from "../validators/settingsValidators.js";

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const [pricing, transfer, announcement] = await Promise.all([
    settingsService.getPricingSettings(),
    settingsService.getTransferSettings(),
    settingsService.getAnnouncementSettings(),
  ]);
  res.json({ settings: { pricing, transfer, announcement } });
});

export const updatePricing = asyncHandler(async (req: Request, res: Response) => {
  const pricing = await settingsService.updatePricingSettings(req.body as UpdatePricingSettingsInput);
  res.json({ settings: { pricing } });
});

export const updateTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await settingsService.updateTransferSettings(req.body as UpdateTransferSettingsInput);
  res.json({ settings: { transfer } });
});

export const updateAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const announcement = await settingsService.updateAnnouncementSettings(req.body as UpdateAnnouncementSettingsInput);
  res.json({ settings: { announcement } });
});

export const getPublicAnnouncement = asyncHandler(async (_req: Request, res: Response) => {
  const announcement = await settingsService.getPublicAnnouncement();
  res.set("Cache-Control", "public, max-age=60").json({ announcement });
});
