import type { Role } from "@caracol/shared";
import mongoose from "mongoose";
import { isTest } from "../config/env.js";
import { User } from "../models/User.js";

export interface AuthUser {
  role: Role;
  isActive: boolean;
}

interface Entry extends AuthUser {
  expiresAt: number;
}

/**
 * El rol firmado en el access token puede quedar viejo: si se revoca a alguien o se le cambia el
 * rol, el token sigue siendo válido hasta que vence. Por eso cada request relee el rol y el estado
 * de la cuenta de la base; para no hacer una consulta por request se recuerda unos segundos, y se
 * olvida al instante cuando el rol cambia en esta misma instancia (`invalidateAuthCache`).
 *
 * Con más de una instancia del server, otra puede tardar hasta `TTL_MS` en enterarse de un cambio.
 * En test no se guarda nada, para que cada prueba vea el estado real de la base.
 */
const TTL_MS = isTest ? 0 : 15_000;
const MAX_ENTRIES = 5_000;

const cache = new Map<string, Entry>();

export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  if (!mongoose.isValidObjectId(userId)) return null;

  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return { role: hit.role, isActive: hit.isActive };

  const user = await User.findById(userId).select("role isActive").lean();
  if (!user) {
    cache.delete(userId);
    return null;
  }

  if (TTL_MS > 0) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(userId, { role: user.role, isActive: user.isActive, expiresAt: Date.now() + TTL_MS });
  }
  return { role: user.role, isActive: user.isActive };
}

/** Olvida lo recordado de un usuario: llamar apenas cambia su rol o su estado. */
export function invalidateAuthCache(userId: string): void {
  cache.delete(userId);
}
