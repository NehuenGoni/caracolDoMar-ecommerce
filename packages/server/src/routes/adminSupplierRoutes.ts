import { Router } from "express";
import * as supplierController from "../controllers/supplierController.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from "../validators/supplierValidators.js";

export const adminSupplierRouter = Router();

// Los proveedores son un dato interno: toda la entidad, incluida la lectura, es solo para admin.
adminSupplierRouter.use(authenticate, requireRole("admin"));

adminSupplierRouter.get("/", validateRequest(listSuppliersQuerySchema, "query"), supplierController.listSuppliers);
adminSupplierRouter.post("/", validateRequest(createSupplierSchema), supplierController.createSupplier);
adminSupplierRouter.get("/:id", validateRequest(mongoIdParamSchema, "params"), supplierController.getSupplier);
adminSupplierRouter.patch(
  "/:id",
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(updateSupplierSchema),
  supplierController.updateSupplier,
);
adminSupplierRouter.delete("/:id", validateRequest(mongoIdParamSchema, "params"), supplierController.deleteSupplier);
