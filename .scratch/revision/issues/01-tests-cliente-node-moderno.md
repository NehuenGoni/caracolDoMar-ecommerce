# 01: Tests del cliente verdes en Node ≥ 25

**Qué construir:** Los tests del cliente pasan con cualquier versión de Node soportada. Hoy, con Node 25+, el `localStorage` global de Node tapa al de jsdom y fallan 10 tests de carrito y tema. CI no lo ve porque usa Node 20 (`.nvmrc`).

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] `npm test` pasa con Node 20 y con Node 26
- [ ] El setup de tests del cliente provee un `localStorage`/`sessionStorage` en memoria, aislado entre tests
- [ ] No se toca el código de producción del carrito ni del tema
