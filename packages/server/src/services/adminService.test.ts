import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminInvite } from "../models/AdminInvite.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";

vi.mock("./email/emailService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./email/emailService.js")>();
  return {
    ...actual,
    sendAdminInviteEmail: vi.fn(),
    sendAdminRevokedEmail: vi.fn(),
  };
});

import { sendAdminInviteEmail, sendAdminRevokedEmail } from "./email/emailService.js";
import * as adminService from "./adminService.js";

beforeAll(connectTestDB);
afterEach(() => {
  vi.clearAllMocks();
  return clearTestDB();
});
afterAll(closeTestDB);

async function createUser(role: "admin" | "seller" | "customer", overrides: Partial<Record<string, unknown>> = {}) {
  return User.create({
    email: overrides.email ?? `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
    ...overrides,
  });
}
const createAdmin = (overrides: Partial<Record<string, unknown>> = {}) => createUser("admin", overrides);

describe("inviteStaff", () => {
  it("crea una invitación pendiente con el rol elegido y se lo avisa por email", async () => {
    const admin = await createAdmin();
    const invite = await adminService.inviteStaff({ email: "Nuevo@Example.com", role: "seller" }, admin._id.toString());

    expect(invite.email).toBe("nuevo@example.com");
    expect(invite.role).toBe("seller");
    expect(invite.acceptedAt).toBeUndefined();
    expect(sendAdminInviteEmail).toHaveBeenCalledWith("nuevo@example.com", expect.stringContaining("/accept-invite?token="), "seller");
  });

  it("puede invitar a otro administrador", async () => {
    const admin = await createAdmin();
    const invite = await adminService.inviteStaff({ email: "otro-admin@example.com", role: "admin" }, admin._id.toString());
    expect(invite.role).toBe("admin");
  });

  it("rechaza invitar a alguien que ya es del equipo, sea admin o vendedor", async () => {
    const admin = await createAdmin();
    await createAdmin({ email: "ya-admin@example.com" });
    await createUser("seller", { email: "ya-vendedor@example.com" });

    await expect(
      adminService.inviteStaff({ email: "ya-admin@example.com", role: "seller" }, admin._id.toString()),
    ).rejects.toThrow("ya es parte del equipo");
    await expect(
      adminService.inviteStaff({ email: "ya-vendedor@example.com", role: "admin" }, admin._id.toString()),
    ).rejects.toThrow("ya es parte del equipo");
  });

  it("sí se puede invitar a un cliente existente", async () => {
    const admin = await createAdmin();
    await createUser("customer", { email: "cliente@example.com" });
    const invite = await adminService.inviteStaff({ email: "cliente@example.com", role: "seller" }, admin._id.toString());
    expect(invite.role).toBe("seller");
  });

  it("rechaza una segunda invitación mientras la primera sigue pendiente", async () => {
    const admin = await createAdmin();
    await adminService.inviteStaff({ email: "pendiente@example.com", role: "seller" }, admin._id.toString());
    await expect(
      adminService.inviteStaff({ email: "pendiente@example.com", role: "seller" }, admin._id.toString()),
    ).rejects.toThrow("invitación pendiente");
  });

  it("permite re-invitar si la anterior fue revocada o expiró", async () => {
    const admin = await createAdmin();
    const first = await adminService.inviteStaff({ email: "reinvitar@example.com", role: "seller" }, admin._id.toString());
    await adminService.revokeInvite(first._id.toString());
    const second = await adminService.inviteStaff({ email: "reinvitar@example.com", role: "seller" }, admin._id.toString());
    expect(second._id.toString()).not.toBe(first._id.toString());

    await AdminInvite.create({
      email: "expirada@example.com",
      role: "seller",
      tokenHash: "hash-expirado",
      invitedBy: admin._id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const invite = await adminService.inviteStaff({ email: "expirada@example.com", role: "admin" }, admin._id.toString());
    expect(invite.email).toBe("expirada@example.com");
  });
});

describe("revokeInvite", () => {
  it("revoca una invitación pendiente", async () => {
    const admin = await createAdmin();
    const invite = await adminService.inviteStaff({ email: "a-revocar@example.com", role: "seller" }, admin._id.toString());
    await adminService.revokeInvite(invite._id.toString());
    expect((await AdminInvite.findById(invite._id))?.revokedAt).toBeInstanceOf(Date);
  });

  it("rechaza revocar una invitación ya aceptada o inexistente", async () => {
    const admin = await createAdmin();
    const invite = await adminService.inviteStaff({ email: "aceptada@example.com", role: "seller" }, admin._id.toString());
    invite.acceptedAt = new Date();
    await invite.save();

    await expect(adminService.revokeInvite(invite._id.toString())).rejects.toThrow();
    await expect(adminService.revokeInvite("64b000000000000000000000")).rejects.toThrow();
  });
});

describe("listStaff", () => {
  it("devuelve administradores y vendedores, no clientes", async () => {
    await createAdmin();
    await createUser("seller");
    await createUser("customer");

    const staff = await adminService.listStaff();

    expect(staff.map((u) => u.role).sort()).toEqual(["admin", "seller"]);
  });
});

describe("changeStaffRole", () => {
  it("pasa a un vendedor a admin y a un admin a vendedor", async () => {
    const admin = await createAdmin();
    const other = await createAdmin();
    const seller = await createUser("seller");

    const promoted = await adminService.changeStaffRole(seller._id.toString(), "admin", admin._id.toString());
    expect(promoted.role).toBe("admin");

    const demoted = await adminService.changeStaffRole(other._id.toString(), "seller", admin._id.toString());
    expect(demoted.role).toBe("seller");
    expect((await User.findById(other._id))?.role).toBe("seller");
  });

  it("no deja cambiarse el rol a uno mismo", async () => {
    const admin = await createAdmin();
    await createAdmin();
    await expect(
      adminService.changeStaffRole(admin._id.toString(), "seller", admin._id.toString()),
    ).rejects.toThrow("vos mismo");
  });

  it("no deja pasar a vendedor al último administrador activo", async () => {
    const acting = await createAdmin({ isActive: false });
    const onlyActive = await createAdmin();
    await expect(
      adminService.changeStaffRole(onlyActive._id.toString(), "seller", acting._id.toString()),
    ).rejects.toThrow("al menos un administrador");
    expect((await User.findById(onlyActive._id))?.role).toBe("admin");
  });

  it("rechaza un cambio al mismo rol, o sobre alguien que no es del equipo", async () => {
    const admin = await createAdmin();
    const seller = await createUser("seller");
    const customer = await createUser("customer");

    await expect(adminService.changeStaffRole(seller._id.toString(), "seller", admin._id.toString())).rejects.toThrow("Ya es");
    await expect(adminService.changeStaffRole(customer._id.toString(), "admin", admin._id.toString())).rejects.toThrow(
      "no encontrado",
    );
  });
});

describe("revokeStaff", () => {
  it("rechaza que alguien se revoque a sí mismo", async () => {
    const admin = await createAdmin();
    await createAdmin();
    await expect(adminService.revokeStaff(admin._id.toString(), admin._id.toString())).rejects.toThrow();
  });

  it("rechaza revocar a alguien que no es del equipo", async () => {
    const admin = await createAdmin();
    const customer = await createUser("customer");
    await expect(adminService.revokeStaff(customer._id.toString(), admin._id.toString())).rejects.toThrow("no encontrado");
  });

  it("no deja al negocio sin ningún administrador activo", async () => {
    const acting = await createAdmin({ isActive: false });
    const onlyActive = await createAdmin();
    await expect(adminService.revokeStaff(onlyActive._id.toString(), acting._id.toString())).rejects.toThrow(
      "al menos un administrador",
    );
  });

  it("un admin puede revocar a otro mientras quede alguno activo", async () => {
    const admin = await createAdmin();
    const other = await createAdmin();
    const updated = await adminService.revokeStaff(other._id.toString(), admin._id.toString());
    expect(updated.role).toBe("customer");
  });

  it("a un vendedor se lo revoca sin tocar la regla del último admin", async () => {
    const onlyAdmin = await createAdmin();
    const seller = await createUser("seller");
    const updated = await adminService.revokeStaff(seller._id.toString(), onlyAdmin._id.toString());
    expect(updated.role).toBe("customer");
  });

  it("vuelve a cliente, cierra sus sesiones y le avisa por email", async () => {
    const admin = await createAdmin();
    const target = await createUser("seller");
    await RefreshToken.create({
      user: target._id,
      jti: "jti-target",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const updated = await adminService.revokeStaff(target._id.toString(), admin._id.toString());

    expect(updated.role).toBe("customer");
    expect((await RefreshToken.findOne({ jti: "jti-target" }))?.revokedAt).toBeInstanceOf(Date);
    expect(sendAdminRevokedEmail).toHaveBeenCalledTimes(1);
  });
});
