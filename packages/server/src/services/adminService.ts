import { ROLE_LABELS, isStaff, type StaffRole } from "@caracol/shared";
import { env } from "../config/env.js";
import { AdminInvite, type IAdminInvite } from "../models/AdminInvite.js";
import { User, type UserDocument } from "../models/User.js";
import { invalidateAuthCache } from "../utils/authCache.js";
import { revokeAllUserRefreshTokens } from "./authService.js";
import { sendAdminInviteEmail, sendAdminRevokedEmail } from "./email/emailService.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/AppError.js";
import { generateRawToken, hashToken } from "../utils/hash.js";
import type { InviteStaffInput } from "../validators/adminValidators.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function isInvitePending(invite: Pick<IAdminInvite, "acceptedAt" | "revokedAt" | "expiresAt">): boolean {
  return !invite.acceptedAt && !invite.revokedAt && invite.expiresAt.getTime() > Date.now();
}

/** Invita a alguien al equipo con un rol (admin o vendedor/a). Recibe un email con el link para crear su cuenta. */
export async function inviteStaff(input: InviteStaffInput, invitedBy: string) {
  const email = input.email.toLowerCase().trim();

  const existing = await User.findOne({ email, isActive: true });
  if (existing && isStaff(existing.role)) {
    throw new ConflictError(
      `Ese usuario ya es parte del equipo (${ROLE_LABELS[existing.role]}). Si querés, cambiale el rol desde la lista.`,
    );
  }

  const pendingInvites = await AdminInvite.find({ email });
  if (pendingInvites.some(isInvitePending)) {
    throw new ConflictError("Ya existe una invitación pendiente para ese email");
  }

  const rawToken = generateRawToken();
  const invite = await AdminInvite.create({
    email,
    role: input.role,
    tokenHash: hashToken(rawToken),
    invitedBy,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  sendAdminInviteEmail(email, `${env.CLIENT_URL}/accept-invite?token=${rawToken}`, input.role);

  return invite;
}

export async function listPendingInvites() {
  return AdminInvite.find({
    acceptedAt: { $exists: false },
    revokedAt: { $exists: false },
  }).sort({ createdAt: -1 });
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const invite = await AdminInvite.findById(inviteId);
  if (!invite) {
    throw new NotFoundError("Invitación no encontrada");
  }
  if (invite.acceptedAt) {
    throw new ConflictError("La invitación ya fue aceptada");
  }
  if (invite.revokedAt) {
    throw new ConflictError("La invitación ya fue revocada");
  }

  invite.revokedAt = new Date();
  await invite.save();
}

/** El equipo: administradores y vendedores. */
export async function listStaff(): Promise<UserDocument[]> {
  return User.find({ role: { $in: ["admin", "seller"] } }).sort({ createdAt: 1 });
}

async function countActiveAdmins(): Promise<number> {
  return User.countDocuments({ role: "admin", isActive: true });
}

async function getStaffMember(targetUserId: string): Promise<UserDocument> {
  const target = await User.findById(targetUserId);
  if (!target || !isStaff(target.role)) {
    throw new NotFoundError("Integrante del equipo no encontrado");
  }
  return target;
}

/** Quitarle el último administrador activo al negocio lo dejaría sin nadie que lo maneje. */
async function assertNotLastAdmin(target: UserDocument): Promise<void> {
  if (target.role === "admin" && target.isActive && (await countActiveAdmins()) <= 1) {
    throw new ConflictError("Debe quedar al menos un administrador activo");
  }
}

/** Cambia el rol de alguien del equipo (admin ↔ vendedor/a). Rige de inmediato: no espera a que venza su sesión. */
export async function changeStaffRole(
  targetUserId: string,
  role: StaffRole,
  actingAdminId: string,
): Promise<UserDocument> {
  if (targetUserId === actingAdminId) {
    throw new ForbiddenError("No podés cambiarte el rol a vos mismo");
  }

  const target = await getStaffMember(targetUserId);
  if (target.role === role) {
    throw new BadRequestError(`Ya es ${ROLE_LABELS[role]}`);
  }
  if (role !== "admin") await assertNotLastAdmin(target);

  target.role = role;
  await target.save();
  invalidateAuthCache(target._id.toString());

  return target;
}

/** Saca a alguien del equipo: vuelve a ser cliente y se le cierran todas las sesiones. */
export async function revokeStaff(targetUserId: string, actingAdminId: string): Promise<UserDocument> {
  if (targetUserId === actingAdminId) {
    throw new ForbiddenError("No podés revocar tus propios permisos");
  }

  const target = await getStaffMember(targetUserId);
  await assertNotLastAdmin(target);

  target.role = "customer";
  await target.save();
  invalidateAuthCache(target._id.toString());

  await revokeAllUserRefreshTokens(target._id.toString());
  sendAdminRevokedEmail(target);

  return target;
}
