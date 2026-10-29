import { Router } from "express";
import * as storeSaleController from "../controllers/storeSaleController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";
import {
  createStoreSaleSchema,
  emailStoreSaleSchema,
  listStoreSalesQuerySchema,
  lookupStoreProductQuerySchema,
  returnStoreSaleSchema,
  storeSalesSummaryQuerySchema,
  voidStoreSaleSchema,
} from "../validators/storeSaleValidators.js";

export const adminStoreSaleRouter = Router();

adminStoreSaleRouter.use(authenticate);

adminStoreSaleRouter.post(
  "/",
  requirePermission("pos:sell"),
  validateRequest(createStoreSaleSchema),
  storeSaleController.createStoreSale,
);
adminStoreSaleRouter.get(
  "/",
  requirePermission("pos:sell"),
  validateRequest(listStoreSalesQuerySchema, "query"),
  storeSaleController.listStoreSales,
);
// Rutas fijas antes de "/:id" para que no se interpreten como un id.
adminStoreSaleRouter.get(
  "/summary",
  requirePermission("reports:read"),
  validateRequest(storeSalesSummaryQuerySchema, "query"),
  storeSaleController.getStoreSalesSummary,
);
adminStoreSaleRouter.get(
  "/lookup",
  requirePermission("pos:sell"),
  validateRequest(lookupStoreProductQuerySchema, "query"),
  storeSaleController.lookupProduct,
);
adminStoreSaleRouter.get(
  "/:id",
  requirePermission("pos:sell"),
  validateRequest(mongoIdParamSchema, "params"),
  storeSaleController.getStoreSale,
);
// Anular repone stock y reintegra la plata de una venta entera: solo un admin.
adminStoreSaleRouter.post(
  "/:id/void",
  requirePermission("pos:void"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(voidStoreSaleSchema),
  storeSaleController.voidStoreSale,
);
adminStoreSaleRouter.post(
  "/:id/returns",
  requirePermission("pos:sell"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(returnStoreSaleSchema),
  storeSaleController.returnStoreSaleItems,
);
adminStoreSaleRouter.post(
  "/:id/email",
  requirePermission("pos:sell"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(emailStoreSaleSchema),
  storeSaleController.emailStoreSale,
);
