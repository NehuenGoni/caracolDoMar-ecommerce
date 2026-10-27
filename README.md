# Caracol do Mar

Tienda online + sistema de gestión del local físico (POS, caja, stock, proveedores) de
**Caracol do Mar**, tienda holística (sahumerios, ropa hindú, tarot, velas, cristales).

Monorepo con npm workspaces:

| Paquete | Qué es |
|---|---|
| `packages/shared` | Tipos de dominio, constantes (`BUSINESS`) y utilidades de dinero/slug. Lo consumen server y client. |
| `packages/server` | API Express + TypeScript + MongoDB (Mongoose) + Zod. |
| `packages/client` | SPA React + Vite + Tailwind 4. Tienda pública, cuenta del cliente y panel admin/POS. |

## Requisitos

- Node 20 (ver `.nvmrc`)
- MongoDB local o Atlas

## Puesta en marcha

```bash
npm install
cp packages/server/.env.example packages/server/.env   # completar secretos
cp packages/client/.env.example packages/client/.env.local
npm run build:shared
npm run seed:admin -w packages/server                  # crea el primer admin
npm run dev:server    # http://localhost:4000
npm run dev:client    # http://localhost:5173
```

Las integraciones (Mercado Pago, Cloudinary, Resend, MiCorreo) son opcionales: sin sus claves
la función correspondiente queda apagada o usa un mock.

## Scripts (desde la raíz)

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | Compila shared y chequea tipos de server y client |
| `npm run lint` | ESLint en server y client |
| `npm test` | Vitest en los tres paquetes |
| `npm run format` / `format:check` | Prettier |

## Deploy

- **Server:** Fly.io (`fly.toml`, `Dockerfile` desde la raíz del monorepo).
- **Client:** Vercel (`vercel.json`).

El estado y el plan de trabajo están en `CLAUDE.md`.
# caracolDoMar-eccomerce
