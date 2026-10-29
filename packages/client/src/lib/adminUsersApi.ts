import type { StaffRole, User } from "@caracol/shared";
import { apiGet, apiPatch, apiPost } from "./apiClient.js";

export interface StaffInvite {
  _id: string;
  email: string;
  role: StaffRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export const inviteStaff = (email: string, role: StaffRole) =>
  apiPost<{ invite: StaffInvite }>("/admin/invites", { email, role });

export const listPendingInvites = () => apiGet<{ invites: StaffInvite[] }>("/admin/invites");

export const revokeInvite = (id: string) => apiPost<void>(`/admin/invites/${id}/revoke`);

export const listStaff = () => apiGet<{ staff: User[] }>("/admin/staff");

export const changeStaffRole = (id: string, role: StaffRole) =>
  apiPatch<{ user: User }>(`/admin/staff/${id}/role`, { role });

export const revokeStaff = (id: string) => apiPost<{ user: User }>(`/admin/staff/${id}/revoke`);
