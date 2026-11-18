# 07: E2E en CI

**Qué construir:** Cada push corre los recorridos de usuario en un job aparte de GitHub Actions; si uno falla, quedan trace y screenshots descargables.

**Bloqueado por:** 02 (recorrido compra con transferencia)

**Estado:** ready-for-agent

- [ ] Job separado del de typecheck/lint/test
- [ ] Artifacts de Playwright subidos solo si hay fallas
- [ ] Cache de navegadores para que el job no tarde de más
