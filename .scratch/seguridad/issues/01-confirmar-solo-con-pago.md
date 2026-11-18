# 01: Un pedido solo se confirma con el pago aprobado

**Qué construir:** Hoy el cambio manual de estado permite pasar un pedido de `pending` a `confirmed` con `orders:prepare` (lo tiene el vendedor), salteando el pago: el pedido deja de vencer y se puede despachar sin cobrar. Desde ahora la confirmación llega solo por Mercado Pago o por la revisión de la transferencia.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] El cambio manual de estado rechaza `pending → confirmed` con un mensaje claro, para cualquier rol
- [ ] El webhook de Mercado Pago y la revisión de transferencia siguen confirmando
- [ ] El panel no ofrece "Confirmar" en un pedido pendiente sin pago aprobado
- [ ] Tests de regresión para vendedor y admin
