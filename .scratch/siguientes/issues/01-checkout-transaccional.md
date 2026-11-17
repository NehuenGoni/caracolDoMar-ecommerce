# 01: Checkout dentro de una transacción

**Qué construir:** Un pedido web reserva stock y se crea de forma atómica con `withTransaction`: si algo falla a mitad de camino, no queda stock descontado ni pedido a medias. Se elimina la compensación manual actual.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Descuento de stock, movimientos, pedido y vaciado de carrito en una sola transacción
- [ ] Emails y llamadas a Mercado Pago fuera de la transacción (puede reintentarse)
- [ ] Sigue funcionando con un Mongo sin replica set
- [ ] Test con `connectTestReplSetDB` que fuerza una falla a mitad y verifica que no quedó nada escrito
