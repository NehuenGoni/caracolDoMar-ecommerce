import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Supplier } from "../models/Supplier.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { withTransaction } from "./transaction.js";

// Mongo suelto (sin replica set), como un Mongo local de desarrollo.
beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe("withTransaction sin replica set", () => {
  it("corre igual, sin sesión, y devuelve el resultado", async () => {
    let receivedSession: unknown = "no-llamado";
    const result = await withTransaction(async (session) => {
      receivedSession = session;
      await Supplier.create([{ name: "Sin transacción" }], { session });
      return "ok";
    });

    expect(result).toBe("ok");
    expect(receivedSession).toBeUndefined();
    expect(await Supplier.countDocuments()).toBe(1);
  });

  it("propaga el error de la función", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
