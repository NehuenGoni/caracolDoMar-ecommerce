import type { Request, Response } from "express";
import * as adminService from "../services/adminService.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import type { ChangeStaffRoleInput, InviteStaffInput } from "../validators/adminValidators.js";
import type { MongoIdParam } from "../validators/commonValidators.js";

export const inviteStaff = asyncHandler(async (req: Request, res: Response) => {
  const invite = await adminService.inviteStaff(req.body as InviteStaffInput, req.user!.id);
  res.status(201).json({ invite });
});

export const listPendingInvites = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ invites: await adminService.listPendingInvites() });
});

export const revokeInvite = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  await adminService.revokeInvite(id);
  res.status(204).send();
});

export const listStaff = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ staff: await adminService.listStaff() });
});

export const changeStaffRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const { role } = req.body as ChangeStaffRoleInput;
  const user = await adminService.changeStaffRole(id, role, req.user!.id);
  res.json({ user });
});

export const revokeStaff = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const user = await adminService.revokeStaff(id, req.user!.id);
  res.json({ user });
});
