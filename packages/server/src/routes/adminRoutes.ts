import { Router } from "express";
import * as adminController from "../controllers/adminController.js";
import { authenticate, requirePermission } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { changeStaffRoleSchema, inviteStaffSchema } from "../validators/adminValidators.js";
import { mongoIdParamSchema } from "../validators/commonValidators.js";

export const adminRouter = Router();

/**
 * Este router se monta en `/api/admin`, antes que los demás routers del panel (productos, pedidos,
 * caja…). Por eso el permiso va ruta por ruta y NO con `router.use`: un `use` acá le exigiría
 * `users:manage` a todo lo que cuelga de `/api/admin`, incluido lo que otros routers abren al
 * vendedor.
 */
const manageTeam = [authenticate, requirePermission("users:manage")];

adminRouter.post("/invites", ...manageTeam, validateRequest(inviteStaffSchema), adminController.inviteStaff);
adminRouter.get("/invites", ...manageTeam, adminController.listPendingInvites);
adminRouter.post(
  "/invites/:id/revoke",
  ...manageTeam,
  validateRequest(mongoIdParamSchema, "params"),
  adminController.revokeInvite,
);

adminRouter.get("/staff", ...manageTeam, adminController.listStaff);
adminRouter.patch(
  "/staff/:id/role",
  ...manageTeam,
  validateRequest(mongoIdParamSchema, "params"),
  validateRequest(changeStaffRoleSchema),
  adminController.changeStaffRole,
);
adminRouter.post(
  "/staff/:id/revoke",
  ...manageTeam,
  validateRequest(mongoIdParamSchema, "params"),
  adminController.revokeStaff,
);
