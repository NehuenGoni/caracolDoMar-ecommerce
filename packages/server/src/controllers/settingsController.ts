import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as settingsService from "../services/settingsService.js";
import type {
  UpdatePricingSettingsInput,
  UpdateTransferSettingsInput,
} from "../validators/settingsValidators.js";

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const [pricing, transfer] = await Promise.all([
    settingsService.getPricingSettings(),
    settingsService.getTransferSettings(),
  ]);
  res.json({ settings: { pricing, transfer } });
});

export const updatePricing = asyncHandler(async (req: Request, res: Response) => {
  const pricing = await settingsService.updatePricingSettings(req.body as UpdatePricingSettingsInput);
  res.json({ settings: { pricing } });
});

export const updateTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await settingsService.updateTransferSettings(req.body as UpdateTransferSettingsInput);
  res.json({ settings: { transfer } });
});
