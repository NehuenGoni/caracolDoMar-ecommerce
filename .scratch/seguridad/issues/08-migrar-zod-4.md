# 08: Migrar a Zod 4 y sumar npm audit al CI

**Qué construir:** Se corrige la vulnerabilidad alta de Zod 3 (GHSA-mrhx-c7xc-m3w5) pasando a Zod 4, y el CI falla si aparece una vulnerabilidad alta nueva en dependencias de producción.

**Bloqueado por:** Ninguno (conviene después de 05, que toca validadores)

**Estado:** ready-for-agent

- [ ] `npm audit --omit=dev` sin vulnerabilidades altas
- [ ] Todos los validadores migrados, con los mensajes de error en español intactos
- [ ] Paso de `npm audit` en CI
- [ ] typecheck, lint y tests en verde
