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
  `variants[].stock` por otro camino; editar un producto nunca cambia el stock de variantes existentes.
- **Productos hacia la API:** siempre por `serializeProducts` (`productService`): quita `costPrice` a
  no-admins y calcula el stock de los kits.
- **Variantes:** `attributes: [{name, value}]` (pueden ser 0, 1 o varios). Carritos, pedidos, ventas y POS
  guardan solo `variantLabel` ("Rojo / M", `formatVariantLabel` de shared).
- **Kits (`isBundle`):** una variante con el precio del kit, sin stock propio; su stock sale de los
  componentes. El descuento/reposición se expande en `decrementStock`, `restockItems` y `returnStock`
  (`bundleService.expandBundleItems`): todo stock nuevo tiene que pasar por esas tres. Un kit no se
  convierte en producto común ni al revés, y no cambia de composición una vez vendido.
- **Piezas únicas (`isUniquePiece`):** stock máximo 1; salen del listado público al venderse (la ficha
  sigue accesible) y no generan alertas de stock bajo.
- **Transacciones:** lo que escribe varios documentos a la vez (compras, importación de facturas) va
  dentro de `withTransaction` (`utils/transaction.ts`) y pasa la `session` a cada consulta. Con un Mongo
  sin replica set corre igual, sin sesión. Sus tests usan `connectTestReplSetDB`. Nada con efectos fuera
  de la base (emails, APIs) puede ir adentro: la transacción se puede reintentar.
- **Costo y precio:** los escribe la compra (`supplierPurchaseService`); el precio sugerido sale de
  `suggestedPrice` (shared) con la configuración de Ajustes.
- **Pago por transferencia:** el pedido nace `pending`, reserva stock y vence a las 48 h sin comprobante
  (24 h más si el admin rechaza uno). Los datos de la cuenta solo los ve el dueño del pedido.
- **Importación de facturas con IA:** la IA nunca toca el catálogo; deja un borrador que revisa un admin.
  `anthropicService.ts` es el único archivo que importa el SDK (los tests lo mockean).
- **Transacciones:** lo que escribe varios documentos a la vez (compras, importación de facturas) va
  dentro de `withTransaction` (`utils/transaction.ts`) y pasa la `session` a cada consulta. Con un Mongo
  sin replica set corre igual, sin sesión. Sus tests usan `connectTestReplSetDB`. Nada con efectos fuera
  de la base (emails, APIs) puede ir adentro: la transacción se puede reintentar.
- **Costo y precio:** los escribe la compra (`supplierPurchaseService`); el precio sugerido sale de
  `suggestedPrice` (shared) con la configuración de Ajustes.
- **Pago por transferencia:** el pedido nace `pending`, reserva stock y vence a las 48 h sin comprobante
  (24 h más si el admin rechaza uno). Los datos de la cuenta solo los ve el dueño del pedido.
- **Importación de facturas con IA:** la IA nunca toca el catálogo; deja un borrador que revisa un admin.
  `anthropicService.ts` es el único archivo que importa el SDK (los tests lo mockean).
- **Roles y permisos:** `customer | seller | admin`. Qué puede cada uno vive en un solo lugar:
  `ROLE_PERMISSIONS` (`shared/src/constants/permissions.ts`). El server protege con
  `requirePermission("...")`, nunca con el rol a mano; la UI usa `can("...")` (`useAuth`) solo para no
  mostrar lo que no se puede usar. Un permiso nuevo = agregarlo ahí y en la ruta.
- **El rol sale de la base, no del token:** `authenticate` lo relee (`utils/authCache.ts`, caché de 15 s
  que se invalida al cambiar el rol). Revocar o degradar rige de inmediato. Cualquier lugar que cambie
  `role` o `isActive` tiene que llamar `invalidateAuthCache`.
- **`adminRouter` (equipo) se monta en `/api/admin` antes que los demás:** su permiso va ruta por ruta,
  nunca con `router.use`, o le cierra el paso a todo lo que cuelga de `/api/admin`.
- **El vendedor no ve costos ni proveedores:** los productos del panel salen por `serializeProducts` con
  `costs:read`. Todo endpoint nuevo que devuelva costos tiene que pasar por ahí.
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
- Fase 1: hecha. El costo (`costPrice`) solo sale por
  `serializeProducts` (`productService`) para no-admins; `updateProduct` no toca el stock de variantes
  existentes; `deleteProduct` es baja lógica; los comprobantes solo se aceptan del Cloudinary propio.
- Fase 2: hecha (variantes con varios atributos, filtros/orden/subcategorías, `GET /products/facets`,
  videos, piezas únicas, kits). Los videos van en `videos[]`, aparte de `images[]`.
- Fase 3: hecha (proveedores, compras idempotentes y transaccionales, precios automáticos opcionales,
  transferencia bancaria, importación de facturas con IA). Las transacciones cubren compras e importación;
  el checkout y el POS siguen con compensación manual (funciona y está testeada).
- Fase 4: hecha (roles admin y vendedor, permisos por ruta, equipo con invitaciones por rol).
- Fase 5: hecha (reportes de ventas, margen, más vendidos, stock valorizado y sin movimiento, CSV; dashboard
  con el mes en curso). Solo admin (`reports:read`). Los ítems de pedidos y ventas guardan `unitCost` al
  venderse: el margen histórico no cambia si después cambia el costo. Gráficos en SVG propio, sin librería.
- Fases 6–7: SEO, identidad visual.
