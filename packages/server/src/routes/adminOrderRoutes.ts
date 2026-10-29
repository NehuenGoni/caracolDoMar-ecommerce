import { hasPermission } from "@caracol/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import * as orderController from "../controllers/orderController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { ForbiddenError } from "../utils/AppError.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";
import {
  adminListOrdersQuerySchema,
  confirmTransferPaymentSchema,
  updateOrderStatusSchema,
} from "../validators/orderValidators.js";

export const adminOrderRouter = Router();

adminOrderRouter.use(authenticate);

/** Cancelar devuelve el stock: quien solo prepara pedidos puede avanzarlos, pero no cancelarlos. */
function cancelNeedsManage(req: Request, _res: Response, next: NextFunction): void {
  const cancelling = (req.body as { status?: string }).status === "cancelled";
  if (cancelling && !hasPermission(req.user?.role, "orders:manage")) {
    next(new ForbiddenError("Solo un administrador puede cancelar pedidos"));
    return;
  }
  next();
}

adminOrderRouter.get(
  "/",
  requirePermission("orders:read"),
  validateRequest(adminListOrdersQuerySchema, "query"),
  orderController.adminListOrders,
);
adminOrderRouter.get(
  "/:id",
  requirePermission("orders:read"),
  validateRequest(mongoIdParamSchema, "params"),
  orderController.adminGetOrder,
);
adminOrderRouter.patch(
  "/:id/status",
  requirePermission("orders:prepare"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(updateOrderStatusSchema),
  cancelNeedsManage,
  orderController.updateOrderStatus,
);
adminOrderRouter.post(
  "/:id/transfer-review",
  requirePermission("orders:manage"),
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(confirmTransferPaymentSchema),
  orderController.reviewTransferPayment,
);
adminOrderRouter.post(
  "/:id/reactivate",
  requirePermission("orders:manage"),
  validateRequest(mongoIdParamSchema, "params"),
  orderController.reactivateOrder,
);
adminOrderRouter.post(
  "/:id/refund",
  requirePermission("orders:manage"),
  validateRequest(mongoIdParamSchema, "params"),
  orderController.refundOrderPayment,
);
adminOrderRouter.post(
  "/:id/carrier-import",
  requirePermission("orders:prepare"),
  validateRequest(mongoIdParamSchema, "params"),
  orderController.importOrderToCarrier,
);
