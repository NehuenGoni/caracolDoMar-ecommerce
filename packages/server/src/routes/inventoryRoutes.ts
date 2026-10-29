import { Router } from "express";
import * as inventoryController from "../controllers/inventoryController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { adjustStockSchema, listMovementsQuerySchema } from "../validators/inventoryValidators.js";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

inventoryRouter.post(
  "/adjustments",
  requirePermission("inventory:adjust"),
  validateRequest(adjustStockSchema),
  inventoryController.adjustStock,
);
inventoryRouter.get(
  "/movements",
  requirePermission("inventory:read"),
  validateRequest(listMovementsQuerySchema, "query"),
  inventoryController.listMovements,
);
inventoryRouter.get("/low-stock", requirePermission("inventory:read"), inventoryController.listLowStock);
