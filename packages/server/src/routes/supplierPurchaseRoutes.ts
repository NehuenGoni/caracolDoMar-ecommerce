import { Router } from "express";
import * as supplierPurchaseController from "../controllers/supplierPurchaseController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";
import {
  createSupplierPurchaseSchema,
  listSupplierPurchasesQuerySchema,
} from "../validators/supplierPurchaseValidators.js";

export const supplierPurchaseRouter = Router();

supplierPurchaseRouter.use(authenticate, requirePermission("purchases:manage"));

supplierPurchaseRouter.post(
  "/",
  validateRequest(createSupplierPurchaseSchema),
  supplierPurchaseController.createSupplierPurchase,
);
supplierPurchaseRouter.get(
  "/",
  validateRequest(listSupplierPurchasesQuerySchema, "query"),
  supplierPurchaseController.listSupplierPurchases,
);
supplierPurchaseRouter.get(
  "/:id",
  validateRequest(mongoIdParamSchema, "params"),
  supplierPurchaseController.getSupplierPurchase,
);
