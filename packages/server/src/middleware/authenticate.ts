import type { NextFunction, Request, Response } from "express";
import { hasPermission, type Permission, type Role } from "@caracol/shared";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError.js";
import { getAuthUser } from "../utils/authCache.js";
import { verifyAccessToken } from "../utils/jwt.js";

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Requiere un access token válido y adjunta `req.user`. El rol NO sale del token sino de la base
 * (ver `authCache`): si la cuenta se revocó, se desactivó o cambió de rol, rige de inmediato.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next(new UnauthorizedError("Falta el token de acceso"));
    return;
  }

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    next(new UnauthorizedError("Token de acceso inválido o expirado"));
    return;
  }

  try {
    const user = await getAuthUser(userId);
    if (!user || !user.isActive) {
      next(new UnauthorizedError("La cuenta no está disponible"));
      return;
    }
    req.user = { id: userId, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** Adjunta `req.user` si hay un token válido de una cuenta activa, pero nunca bloquea la request. */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const userId = verifyAccessToken(token).sub;
    const user = await getAuthUser(userId);
    if (user?.isActive) req.user = { id: userId, role: user.role };
  } catch {
    // Token inválido o cuenta inexistente: seguimos como request anónima.
  }
  next();
}

/** Debe montarse después de `authenticate`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

/**
 * Exige TODOS los permisos indicados (ver `ROLE_PERMISSIONS` en shared). Debe montarse después de
 * `authenticate`.
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!permissions.every((permission) => hasPermission(req.user!.role, permission))) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
