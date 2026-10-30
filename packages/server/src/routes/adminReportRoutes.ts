import { Router } from "express";
import * as reportController from "../controllers/reportController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  exportReportQuerySchema,
  salesReportQuerySchema,
  slowMoversQuerySchema,
  topProductsQuerySchema,
} from "../validators/reportValidators.js";

export const adminReportRouter = Router();

// Los reportes muestran costos y márgenes: solo quien tiene `reports:read` (admin).
adminReportRouter.use(authenticate, requirePermission("reports:read"));

adminReportRouter.get("/sales", validateRequest(salesReportQuerySchema, "query"), reportController.getSales);
adminReportRouter.get(
  "/top-products",
  validateRequest(topProductsQuerySchema, "query"),
  reportController.getTopProducts,
);
adminReportRouter.get("/inventory", reportController.getInventory);
adminReportRouter.get("/slow-movers", validateRequest(slowMoversQuerySchema, "query"), reportController.getSlowMovers);
adminReportRouter.get("/export", validateRequest(exportReportQuerySchema, "query"), reportController.exportReport);
