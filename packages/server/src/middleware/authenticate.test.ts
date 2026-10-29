import express from "express";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";
import { authenticate, optionalAuthenticate, requirePermission, requireRole } from "./authenticate.js";
import { errorHandler } from "./errorHandler.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

function buildProtectedApp() {
  const app = express();
  app.get("/private", authenticate, (req, res) => {
    res.json({ user: req.user });
  });
  app.get("/admin-only", authenticate, requireRole("admin"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/sell", authenticate, requirePermission("pos:sell"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/void", authenticate, requirePermission("pos:void"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/sell-and-void", authenticate, requirePermission("pos:sell", "pos:void"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/optional", optionalAuthenticate, (req, res) => {
    res.json({ user: req.user ?? null });
  });
  app.use(errorHandler);
  return app;
}

async function createUser(role: "customer" | "seller" | "admin", overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
    ...overrides,
  });
  return { user, id: user._id.toString() };
}

const bearer = (id: string, role: "customer" | "seller" | "admin") => ({
  Authorization: `Bearer ${signAccessToken({ sub: id, role })}`,
});

describe("authenticate", () => {
  it("rechaza requests sin token", async () => {
    const res = await request(buildProtectedApp()).get("/private");
    expect(res.status).toBe(401);
  });

  it("rechaza tokens inválidos", async () => {
    const res = await request(buildProtectedApp()).get("/private").set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
  });

  it("acepta un access token válido y adjunta req.user", async () => {
    const { id } = await createUser("customer");
    const res = await request(buildProtectedApp()).get("/private").set(bearer(id, "customer"));
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id, role: "customer" });
  });

  it("el rol sale de la base, no del token: un token viejo de admin no sirve si ya lo degradaron", async () => {
    const { id } = await createUser("seller");
    // El token se firmó cuando era admin, pero hoy en la base es vendedor.
    const res = await request(buildProtectedApp()).get("/private").set(bearer(id, "admin"));
    expect(res.body.user).toEqual({ id, role: "seller" });

    const adminOnly = await request(buildProtectedApp()).get("/admin-only").set(bearer(id, "admin"));
    expect(adminOnly.status).toBe(403);
  });

  it("también al revés: un token de cliente de alguien que ya es admin tiene sus permisos", async () => {
    const { id } = await createUser("admin");
    const res = await request(buildProtectedApp()).get("/admin-only").set(bearer(id, "customer"));
    expect(res.status).toBe(200);
  });

  it("rechaza con 401 una cuenta desactivada", async () => {
    const { id } = await createUser("admin", { isActive: false });
    const res = await request(buildProtectedApp()).get("/private").set(bearer(id, "admin"));
    expect(res.status).toBe(401);
  });

  it("rechaza con 401 un token de un usuario que ya no existe o con un id inválido", async () => {
    const ghost = new Types.ObjectId().toString();
    expect((await request(buildProtectedApp()).get("/private").set(bearer(ghost, "admin"))).status).toBe(401);
    expect((await request(buildProtectedApp()).get("/private").set(bearer("no-es-un-id", "admin"))).status).toBe(401);
  });
});

describe("requireRole", () => {
  it("rechaza con 403 a un rol no autorizado", async () => {
    const { id } = await createUser("customer");
    const res = await request(buildProtectedApp()).get("/admin-only").set(bearer(id, "customer"));
    expect(res.status).toBe(403);
  });

  it("permite el acceso al rol autorizado", async () => {
    const { id } = await createUser("admin");
    const res = await request(buildProtectedApp()).get("/admin-only").set(bearer(id, "admin"));
    expect(res.status).toBe(200);
  });
});

describe("requirePermission", () => {
  it("el vendedor puede vender pero no anular; el admin puede ambas", async () => {
    const seller = await createUser("seller");
    const admin = await createUser("admin");
    const app = buildProtectedApp();

    expect((await request(app).get("/sell").set(bearer(seller.id, "seller"))).status).toBe(200);
    expect((await request(app).get("/void").set(bearer(seller.id, "seller"))).status).toBe(403);
    expect((await request(app).get("/void").set(bearer(admin.id, "admin"))).status).toBe(200);
  });

  it("un cliente no tiene ningún permiso del panel", async () => {
    const { id } = await createUser("customer");
    expect((await request(buildProtectedApp()).get("/sell").set(bearer(id, "customer"))).status).toBe(403);
  });

  it("con varios permisos exige todos", async () => {
    const seller = await createUser("seller");
    const admin = await createUser("admin");
    const app = buildProtectedApp();

    expect((await request(app).get("/sell-and-void").set(bearer(seller.id, "seller"))).status).toBe(403);
    expect((await request(app).get("/sell-and-void").set(bearer(admin.id, "admin"))).status).toBe(200);
  });

  it("sin sesión da 401, no 403", async () => {
    expect((await request(buildProtectedApp()).get("/sell")).status).toBe(401);
  });
});

describe("optionalAuthenticate", () => {
  it("continúa sin user cuando no hay token o es inválido", async () => {
    const app = buildProtectedApp();
    expect((await request(app).get("/optional")).body.user).toBeNull();
    expect((await request(app).get("/optional").set("Authorization", "Bearer invalido")).body.user).toBeNull();
  });

  it("adjunta el user con el rol de la base", async () => {
    const { id } = await createUser("seller");
    const res = await request(buildProtectedApp()).get("/optional").set(bearer(id, "admin"));
    expect(res.body.user).toEqual({ id, role: "seller" });
  });

  it("una cuenta desactivada o inexistente sigue como anónima", async () => {
    const inactive = await createUser("admin", { isActive: false });
    const app = buildProtectedApp();
    expect((await request(app).get("/optional").set(bearer(inactive.id, "admin"))).body.user).toBeNull();
    expect(
      (await request(app).get("/optional").set(bearer(new Types.ObjectId().toString(), "admin"))).body.user,
    ).toBeNull();
  });
});
