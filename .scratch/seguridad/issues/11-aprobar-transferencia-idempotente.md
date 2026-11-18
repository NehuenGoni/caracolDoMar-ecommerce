# 11: Aprobar una transferencia es idempotente

**Qué construir:** Si dos admins aprueban a la vez la transferencia de un pedido cancelado, el stock se descuenta una sola vez y el pedido queda confirmado una sola vez.

**Bloqueado por:** 01 (confirmar solo con pago)

**Estado:** ready-for-agent

- [ ] Lock optimista sobre el estado del pago al aprobar
- [ ] La segunda aprobación concurrente recibe un error claro y no toca stock
- [ ] Test de concurrencia
