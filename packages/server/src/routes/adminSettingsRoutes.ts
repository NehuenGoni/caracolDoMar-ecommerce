import { Router } from "express";
import * as settingsController from "../controllers/settingsController.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { updatePricingSettingsSchema, updateTransferSettingsSchema } from "../validators/settingsValidators.js";

export const adminSettingsRouter = Router();

// La configuración del negocio es interna: lectura y escritura solo para admin.
adminSettingsRouter.use(authenticate, requireRole("admin"));

adminSettingsRouter.get("/", settingsController.getSettings);
adminSettingsRouter.put("/pricing", validateRequest(updatePricingSettingsSchema), settingsController.updatePricing);
adminSettingsRouter.put("/transfer", validateRequest(updateTransferSettingsSchema), settingsController.updateTransfer);
