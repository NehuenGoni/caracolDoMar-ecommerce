# 03: Comprobantes privados y subidas restringidas

**Qué construir:** Los comprobantes de transferencia (con datos bancarios y personales) dejan de ser públicos: solo los ven el dueño del pedido y el equipo autorizado, mediante URL firmada. La firma de subida limita formato, tamaño y tipo de recurso, y un pedido solo acepta un comprobante subido a su propia carpeta.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Firma de subida restringida a jpg/png/webp/pdf y con tamaño máximo
- [ ] Comprobantes guardados como privados; dueño y admin los ven con una URL firmada de vida corta
- [ ] Asociar una URL de otra carpeta (otro pedido, productos) se rechaza
- [ ] Probado en un preview de Vercel: hoy CORS acepta un solo origen, así que hace falta permitir el dominio del preview fuera de producción o probar contra un server de staging
- [ ] Tests de las tres reglas
