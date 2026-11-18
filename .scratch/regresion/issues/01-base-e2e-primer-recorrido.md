# 01: Base de E2E y primer recorrido: visitante navega el catálogo

**Qué construir:** Un comando (`npm run test:e2e`) levanta server + cliente con una base sembrada con datos de prueba y corre con Playwright el primer recorrido de usuario: un visitante entra a la Home, va al catálogo, filtra y abre una ficha. Queda documentada la diferencia entre los dos niveles de test: integración (Vitest, por regla de negocio) y recorridos de usuario (Playwright, como lo usa una persona).

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] `npm run test:e2e` corre desde cero sin servicios externos (Mongo en memoria, integraciones en mock)
- [ ] Datos de prueba deterministas: admin, vendedor, cliente; producto con variantes, kit y pieza única
- [ ] Los recorridos usan roles y textos visibles en español, nunca clases CSS
- [ ] `npm test` no corre los E2E
- [ ] Guía corta de los dos niveles en el repo y una línea en el CLAUDE.md
