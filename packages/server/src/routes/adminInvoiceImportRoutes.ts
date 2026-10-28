import { Router } from "express";
import rateLimit from "express-rate-limit";
import { isTest } from "../config/env.js";
import * as controller from "../controllers/supplierInvoiceImportController.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { invoiceUpload } from "../middleware/uploadFile.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";
import {
  applyImportSchema,
  importLineParamsSchema,
  importQuerySchema,
  updateImportHeaderSchema,
  updateLineSchema,
  uploadInvoiceBodySchema,
} from "../validators/supplierInvoiceImportValidators.js";

// Cada carga dispara una lectura por IA, que cuesta plata de verdad: límite propio y más estricto
// que el general de /api (relajado en test).
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas facturas subidas. Probá de nuevo en un minuto.", code: "TOO_MANY_REQUESTS" },
});

export const adminInvoiceImportRouter = Router();

adminInvoiceImportRouter.use(authenticate, requireRole("admin"));

adminInvoiceImportRouter.get("/status", controller.getStatus);
adminInvoiceImportRouter.post(
  "/",
  uploadLimiter,
  invoiceUpload.single("file"),
  validateRequest(uploadInvoiceBodySchema),
  controller.uploadInvoice,
);
adminInvoiceImportRouter.get("/", validateRequest(importQuerySchema, "query"), controller.listImports);
adminInvoiceImportRouter.get("/:id", validateRequest(mongoIdParamSchema, "params"), controller.getImport);
adminInvoiceImportRouter.patch(
  "/:id",
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(updateImportHeaderSchema),
  controller.updateImport,
);
adminInvoiceImportRouter.patch(
  "/:id/lines/:lineNumber",
  validateRequest(importLineParamsSchema, "params"),
  validateRequest(updateLineSchema),
  controller.updateLine,
);
adminInvoiceImportRouter.post(
  "/:id/apply",
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(applyImportSchema),
  controller.applyImport,
);
adminInvoiceImportRouter.delete("/:id", validateRequest(mongoIdParamSchema, "params"), controller.discardImport);
