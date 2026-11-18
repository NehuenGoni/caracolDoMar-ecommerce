# 02: Venta del POS dentro de una transacción

**Qué construir:** Una venta en el local descuenta stock, registra movimientos y crea la venta de forma atómica, sin compensación manual.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Venta, movimientos de stock y movimiento de caja en una sola transacción
- [ ] Sin efectos externos (emails) dentro de la transacción
- [ ] Test con replica set que fuerza una falla a mitad y verifica que no quedó nada escrito
