import { Router } from "express";
import { z } from "zod";
import * as uploadController from "../controllers/uploadController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { objectIdSchema } from "../validators/commonValidators.js";

export const uploadRouter = Router();

uploadRouter.post(
  "/products/sign",
  authenticate,
  requirePermission("products:write"),
  uploadController.signProductImageUpload,
);

uploadRouter.post(
  "/receipts/:orderId/sign",
  authenticate,
  validateRequest(z.object({ orderId: objectIdSchema }), "params"),
  uploadController.signReceiptUpload,
);
