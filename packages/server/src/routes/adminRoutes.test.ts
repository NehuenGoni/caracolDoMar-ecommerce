import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

vi.mock("../services/email/emailService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/email/emailService.js")>();
  return {
    ...actual,
    sendAdminInviteEmail: vi.fn(),
    sendAdminRevokedEmail: vi.fn(),
  };
});

const app = createApp();

beforeAll(connectTestDB);
afterEach(() => {
  vi.clearAllMocks();
  return clearTestDB();
});
afterAll(closeTestDB);

type Role = "admin" | "seller" | "customer";

async function createUser(role: Role) {
  const user = await User.create({
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
  });
  const token = signAccessToken({ sub: user._id.toString(), role: user.role });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

describe("protección de /api/admin", () => {
  it("rechaza sin autenticación", async () => {
    expect((await request(app).get("/api/admin/staff")).status).toBe(401);
  });

  it("rechaza a un cliente y también a un vendedor: el equipo lo maneja solo un admin", async () => {
    for (const role of ["customer", "seller"] as const) {
      const { auth } = await createUser(role);
      expect((await request(app).get("/api/admin/staff").set(auth)).status).toBe(403);
      expect((await request(app).post("/api/admin/invites").set(auth).send({ email: "x@example.com" })).status).toBe(403);
    }
  });
});

describe("invitaciones", () => {
  it("por defecto invita como vendedor (el rol de menos permisos)", async () => {
    const { auth } = await createUser("admin");
    const res = await request(app).post("/api/admin/invites").set(auth).send({ email: "nueva@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.invite.role).toBe("seller");
  });

  it("invita con el rol elegido y lo muestra en las pendientes", async () => {
    const { auth } = await createUser("admin");
    await request(app).post("/api/admin/invites").set(auth).send({ email: "otro-admin@example.com", role: "admin" }).expect(201);

    const list = await request(app).get("/api/admin/invites").set(auth).expect(200);
    expect(list.body.invites).toHaveLength(1);
    expect(list.body.invites[0]).toMatchObject({ email: "otro-admin@example.com", role: "admin" });
  });

  it("rechaza un rol que no existe, y 'customer' no es un rol de equipo", async () => {
    const { auth } = await createUser("admin");
    await request(app).post("/api/admin/invites").set(auth).send({ email: "x@example.com", role: "superadmin" }).expect(400);
    await request(app).post("/api/admin/invites").set(auth).send({ email: "x@example.com", role: "customer" }).expect(400);
  });

  it("se puede revocar una invitación pendiente", async () => {
    const { auth } = await createUser("admin");
    await request(app).post("/api/admin/invites").set(auth).send({ email: "a@example.com" }).expect(201);
    const list = await request(app).get("/api/admin/invites").set(auth);

    await request(app).post(`/api/admin/invites/${list.body.invites[0]._id}/revoke`).set(auth).expect(204);
    expect((await request(app).get("/api/admin/invites").set(auth)).body.invites).toHaveLength(0);
  });
});

describe("el equipo", () => {
  it("lista admins y vendedores", async () => {
    const { auth } = await createUser("admin");
    await createUser("seller");
    await createUser("customer");

    const res = await request(app).get("/api/admin/staff").set(auth).expect(200);
    expect(res.body.staff.map((u: { role: string }) => u.role).sort()).toEqual(["admin", "seller"]);
  });

  it("cambia el rol de un vendedor a admin", async () => {
    const { auth } = await createUser("admin");
    const { user: seller } = await createUser("seller");

    const res = await request(app)
      .patch(`/api/admin/staff/${seller._id}/role`)
      .set(auth)
      .send({ role: "admin" })
      .expect(200);
    expect(res.body.user.role).toBe("admin");
  });

  it("no deja cambiarse el rol a uno mismo ni usar un rol inválido", async () => {
    const { user, auth } = await createUser("admin");
    await request(app).patch(`/api/admin/staff/${user._id}/role`).set(auth).send({ role: "seller" }).expect(403);
    await request(app).patch(`/api/admin/staff/${user._id}/role`).set(auth).send({ role: "customer" }).expect(400);
  });

  it("revoca a un vendedor", async () => {
    const { auth } = await createUser("admin");
    const { user: seller } = await createUser("seller");

    const res = await request(app).post(`/api/admin/staff/${seller._id}/revoke`).set(auth).expect(200);
    expect(res.body.user.role).toBe("customer");
  });

  it("rechaza que el único admin se revoque a sí mismo", async () => {
    const { user, auth } = await createUser("admin");
    expect((await request(app).post(`/api/admin/staff/${user._id}/revoke`).set(auth)).status).toBe(403);
  });

  it("no deja al negocio sin administradores", async () => {
    const { user: admin1, auth: auth1 } = await createUser("admin");
    const { user: admin2, auth: auth2 } = await createUser("admin");

    await request(app).post(`/api/admin/staff/${admin2._id}/revoke`).set(auth1).expect(200);

    // El admin2 ya no es admin: su token viejo no le sirve para sacar al último.
    const res = await request(app).post(`/api/admin/staff/${admin1._id}/revoke`).set(auth2);
    expect(res.status).toBe(403);
    expect((await User.findById(admin1._id))?.role).toBe("admin");
  });

  it("valida el formato del id", async () => {
    const { auth } = await createUser("admin");
    expect((await request(app).post("/api/admin/staff/no-es-un-id/revoke").set(auth)).status).toBe(400);
    expect((await request(app).patch("/api/admin/staff/no-es-un-id/role").set(auth).send({ role: "admin" })).status).toBe(400);
  });
});

describe("los cambios rigen de inmediato, sin esperar a que venza el token", () => {
  it("un admin degradado a vendedor pierde el acceso a lo del admin en la misma sesión", async () => {
    const { auth: boss } = await createUser("admin");
    const { user, auth: staff } = await createUser("admin");

    await request(app).get("/api/admin/staff").set(staff).expect(200);
    await request(app).patch(`/api/admin/staff/${user._id}/role`).set(boss).send({ role: "seller" }).expect(200);

    await request(app).get("/api/admin/staff").set(staff).expect(403);
  });

  it("alguien revocado deja de entrar al panel con el mismo token", async () => {
    const { auth: boss } = await createUser("admin");
    const { user, auth: seller } = await createUser("seller");

    await request(app).get("/api/inventory/low-stock").set(seller).expect(200);
    await request(app).post(`/api/admin/staff/${user._id}/revoke`).set(boss).expect(200);

    await request(app).get("/api/inventory/low-stock").set(seller).expect(403);
  });

  it("una cuenta desactivada queda afuera de inmediato", async () => {
    const { user, auth } = await createUser("seller");
    await request(app).get("/api/inventory/low-stock").set(auth).expect(200);

    await User.updateOne({ _id: user._id }, { isActive: false });

    await request(app).get("/api/inventory/low-stock").set(auth).expect(401);
  });
});
