import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { User } from "../models/User.js";
import { getPublicAnnouncement } from "../services/settingsService.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

async function tokenFor(role: "admin" | "seller") {
  const user = await User.create({
    email: `${role}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
  });
  return signAccessToken({ sub: user._id.toString(), role });
}

describe("aviso de la tienda", () => {
  it("sin configurar no hay aviso", async () => {
    const res = await request(app).get("/api/settings/announcement");
    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeNull();
  });

  it("el admin lo prende y la tienda lo ve", async () => {
    const token = await tokenFor("admin");
    const put = await request(app)
      .put("/api/admin/settings/announcement")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, text: "Jueves feriado: abrimos de 10 a 14 h", until: null });
    expect(put.status).toBe(200);
    expect(put.body.settings.announcement).toEqual({
      enabled: true,
      text: "Jueves feriado: abrimos de 10 a 14 h",
      until: null,
    });

    const res = await request(app).get("/api/settings/announcement");
    expect(res.body.announcement).toEqual({ text: "Jueves feriado: abrimos de 10 a 14 h" });

    const all = await request(app).get("/api/admin/settings").set("Authorization", `Bearer ${token}`);
    expect(all.body.settings.announcement.enabled).toBe(true);
  });

  it("apagado no se muestra aunque tenga texto", async () => {
    const token = await tokenFor("admin");
    await request(app)
      .put("/api/admin/settings/announcement")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false, text: "Guardado para después" });
    const res = await request(app).get("/api/settings/announcement");
    expect(res.body.announcement).toBeNull();
  });

  it("se muestra hasta el día `until` incluido (día de Argentina) y después se apaga solo", async () => {
    const token = await tokenFor("admin");
    await request(app)
      .put("/api/admin/settings/announcement")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, text: "Feriado", until: "2026-11-02" });

    // 2 de noviembre, 23:30 en Argentina = 3 de noviembre 02:30 UTC: todavía va.
    expect(await getPublicAnnouncement(new Date("2026-11-03T02:30:00Z"))).toEqual({ text: "Feriado" });
    // 3 de noviembre, 00:30 en Argentina: ya venció.
    expect(await getPublicAnnouncement(new Date("2026-11-03T03:30:00Z"))).toBeNull();
  });

  it("no se puede prender sin texto", async () => {
    const token = await tokenFor("admin");
    const res = await request(app)
      .put("/api/admin/settings/announcement")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, text: "  " });
    expect(res.status).toBe(400);
  });

  it("el vendedor no lo puede cambiar", async () => {
    const token = await tokenFor("seller");
    const res = await request(app)
      .put("/api/admin/settings/announcement")
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: true, text: "Hola" });
    expect(res.status).toBe(403);
  });
});
