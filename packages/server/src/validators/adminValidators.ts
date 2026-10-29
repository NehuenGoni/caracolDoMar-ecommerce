import { STAFF_ROLES } from "@caracol/shared";
import { z } from "zod";

export const inviteStaffSchema = z.object({
  email: z.string().email("Email inválido"),
  /** Por defecto el rol de menos permisos: dar admin es una decisión explícita. */
  role: z.enum(STAFF_ROLES).default("seller"),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const changeStaffRoleSchema = z.object({
  role: z.enum(STAFF_ROLES),
});
export type ChangeStaffRoleInput = z.infer<typeof changeStaffRoleSchema>;
