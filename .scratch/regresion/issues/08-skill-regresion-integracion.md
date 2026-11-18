# 08: Skill regresion-integracion

**Qué construir:** Una skill que, a partir del diff actual, decide qué suites de integración correr (shared, server, cliente), las corre e informa qué regla de negocio se rompió, en lenguaje del dominio.

**Bloqueado por:** revision/01 (tests del cliente en verde)

**Estado:** ready-for-agent

- [ ] Mapea áreas del código a suites
- [ ] Informe: qué falló, qué regla protegía ese test, causa probable
- [ ] Probada sobre un cambio real que rompe un test
