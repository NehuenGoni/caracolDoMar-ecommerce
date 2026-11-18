# 05: El filtro de pedidos para revisar respeta false

**Qué construir:** En el listado de pedidos del panel, pedir `needsReview=false` hoy filtra como si fuera `true`, porque cualquier texto se convierte en verdadero. Debe interpretarse igual que `awaitingTransferReview`.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] `needsReview=false` o ausente: sin filtro; `true`: solo los marcados
- [ ] Test de los tres casos
