# Caracol do Mar — guía para trabajar en el repo

Ecommerce + gestión del local físico. Base: proyecto Amanda, con piezas portadas de
Ecommerce/Gran Grow. Idioma de la UI y de los comentarios: español rioplatense.

## Convenciones

- **Dinero siempre en centavos enteros.** Helpers en `packages/shared/src/utils/money.ts`.
- **Capas del server:** `routes → controllers → services → models`. La lógica vive en services;
  los controllers son finos. Validación con Zod en `validators/` vía `validateRequest`.
- **Errores:** lanzar subclases de `AppError` (`utils/errors.ts`); las funciones async van con
  `asyncHandler`. El `errorHandler` central las traduce.
- **Stock:** una sola puerta de escritura (con `StockMovement` inmutable). No modificar
  `variants[].stock` por otro camino.
- **Numeración** (pedidos, ventas, solicitudes): `Counter` / `getNextSequence()`.
- **Integraciones opcionales:** cada una tiene un flag `isXConfigured` en `config/env.ts` y un
  fallback/mock. No hacer que el server dependa de una clave externa para arrancar.
- **Tipos compartidos** en `@caracol/shared`; después de cambiarlos, `npm run build:shared`.
- **Tests:** Vitest. Server con supertest + `mongodb-memory-server` (`src/test/dbTestUtils.ts`).
  Con Vitest 4, los mocks de clases/constructores deben usar `function () {}`, no arrow functions.

## Antes de dar algo por terminado

`npm run typecheck && npm run lint && npm test`

## Pendiente (ver plan por fases)

- Fase 0: scaffold desde Amanda — hecha. Datos del negocio en `shared/src/constants/business.ts`
  siguen en `COMPLETAR`; `packages/client/public/` todavía tiene logo y fotos de Amanda.
- Fase 1: corregir fugas de `costPrice`, edición de stock sin registro, borrado físico de
  productos, transacciones, `$regex` sin escapar.
- Fases 2–7: catálogo del rubro, portar proveedores/IA/pricing, roles admin+vendedor,
  reportes, SEO, identidad visual.
