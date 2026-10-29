import { Router } from "express";
import * as productController from "../controllers/productController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  adminListProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
} from "../validators/productValidators.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";

export const adminProductRouter = Router();

adminProductRouter.use(authenticate);

// Ver el catálogo en el panel lo puede hacer el vendedor (para el punto de venta): la respuesta ya
// sale sin costos ni proveedor salvo para quien tiene `costs:read`. Escribir es solo del admin.
adminProductRouter.get(
  "/",
  requirePermission("products:read"),
  validateRequest(adminListProductsQuerySchema, "query"),
  productController.adminListProducts,
);
adminProductRouter.post(
  "/",
  requirePermission("products:write"),
  validateRequest(createProductSchema),
  productController.createProduct,
);
adminProductRouter.get(
  "/:id",
  requirePermission("products:read"),
  validateRequest(mongoIdParamSchema, "params"),
  productController.adminGetProduct,
);
adminProductRouter.patch(
  "/:id",
  requirePermission("products:write"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(updateProductSchema),
  productController.updateProduct,
);
adminProductRouter.delete(
  "/:id",
  requirePermission("products:write"),
  validateRequest(mongoIdParamSchema, "params"),
  productController.deleteProduct,
);
