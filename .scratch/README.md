# Tickets de Caracol do Mar

Un archivo por ticket. Se trabaja la *frontera*: cualquier ticket cuyos bloqueantes estén hechos.
Al cerrar uno, cambiar su **Estado** a `done` y tildar los criterios.

Estados: `ready-for-agent` (lo puede tomar un agente), `ready-for-human` (necesita al dueño), `done`.

## Revisión: lo que quedó suelto

- [revision/01: Tests del cliente verdes en Node ≥ 25](revision/issues/01-tests-cliente-node-moderno.md) — `done`
- [revision/02: Lint sin warnings de react-refresh](revision/issues/02-lint-sin-warnings.md) — `done`
- [revision/03: Limpiar viñetas duplicadas del CLAUDE.md](revision/issues/03-claude-md-sin-duplicados.md) — `done`
- [revision/04: Cargar los datos reales del negocio](revision/issues/04-datos-del-negocio.md) — `ready-for-human`
- [revision/05: Reemplazar logo y fotos heredadas de Amanda](revision/issues/05-assets-de-caracol.md) — `ready-for-human`

## Lo que sigue

- [siguientes/01: Checkout dentro de una transacción](siguientes/issues/01-checkout-transaccional.md) — `ready-for-agent`
- [siguientes/02: Venta del POS dentro de una transacción](siguientes/issues/02-pos-transaccional.md) — `ready-for-agent`
- [siguientes/03: Puesta en producción](siguientes/issues/03-puesta-en-produccion.md) — `ready-for-human`

## Regresión: integración y recorridos de usuario

- [regresion/01: Base de E2E y primer recorrido: visitante navega el catálogo](regresion/issues/01-base-e2e-primer-recorrido.md) — `ready-for-agent`
- [regresion/02: Recorrido: compra con transferencia](regresion/issues/02-recorrido-compra-transferencia.md) — `ready-for-agent`
- [regresion/03: Recorrido: el carrito anónimo se fusiona al iniciar sesión](regresion/issues/03-recorrido-carrito-anonimo.md) — `ready-for-agent`
- [regresion/04: Recorrido: venta en el POS](regresion/issues/04-recorrido-venta-pos.md) — `ready-for-agent`
- [regresion/05: Recorrido: límites del vendedor](regresion/issues/05-recorrido-limites-vendedor.md) — `ready-for-agent`
- [regresion/06: Recorrido: compra a proveedor, kits y piezas únicas](regresion/issues/06-recorrido-compras-kits-piezas.md) — `ready-for-agent`
- [regresion/07: E2E en CI](regresion/issues/07-e2e-en-ci.md) — `ready-for-agent`
- [regresion/08: Skill regresion-integracion](regresion/issues/08-skill-regresion-integracion.md) — `ready-for-agent`
- [regresion/09: Skill regresion-usuario](regresion/issues/09-skill-regresion-usuario.md) — `ready-for-agent`
- [regresion/10: Agente regression-tester](regresion/issues/10-agente-regression-tester.md) — `ready-for-agent`
- [regresion/11: Agente journey-author](regresion/issues/11-agente-journey-author.md) — `ready-for-agent`

## Seguridad: hallazgos del análisis del 2026-11-17

- [seguridad/01: Un pedido solo se confirma con el pago aprobado](seguridad/issues/01-confirmar-solo-con-pago.md) — `ready-for-agent`
- [seguridad/02: El pago aprobado no se pisa y se valida el monto](seguridad/issues/02-pago-aprobado-no-se-pisa.md) — `ready-for-agent`
- [seguridad/03: Comprobantes privados y subidas restringidas](seguridad/issues/03-comprobantes-privados.md) — `ready-for-agent`
- [seguridad/04: La sesión sobrevive a refrescos simultáneos](seguridad/issues/04-sesion-con-varias-pestanas.md) — `ready-for-agent`
- [seguridad/05: El filtro de pedidos para revisar respeta false](seguridad/issues/05-filtro-needs-review.md) — `ready-for-agent`
- [seguridad/06: El catálogo público decide por permiso, no por rol](seguridad/issues/06-catalogo-por-permiso.md) — `ready-for-agent`
- [seguridad/07: Rate limits en reset, invitación y refresh](seguridad/issues/07-rate-limits-faltantes.md) — `ready-for-agent`
- [seguridad/08: Migrar a Zod 4 y sumar npm audit al CI](seguridad/issues/08-migrar-zod-4.md) — `ready-for-agent`
- [seguridad/09: Headers de seguridad en la SPA](seguridad/issues/09-headers-seguridad-spa.md) — `ready-for-agent`
- [seguridad/10: Aceptar una invitación aplica el rol de inmediato](seguridad/issues/10-invitacion-aplica-rol.md) — `ready-for-agent`
- [seguridad/11: Aprobar una transferencia es idempotente](seguridad/issues/11-aprobar-transferencia-idempotente.md) — `ready-for-agent`
