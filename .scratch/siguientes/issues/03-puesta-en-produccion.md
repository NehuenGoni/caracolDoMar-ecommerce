# 03: Puesta en producción

**Qué construir:** El sitio queda publicado con dominio propio y datos reales: secrets de Fly y Vercel cargados, Mongo con replica set (para que las transacciones corran de verdad) y webhook de Mercado Pago apuntando a producción.

**Bloqueado por:** revision/04 (datos del negocio), revision/05 (assets de Caracol)

**Estado:** ready-for-human

- [ ] Guía paso a paso (`/wizard`) para cargar secrets en Fly, Vercel y GitHub
- [ ] Mongo de producción con replica set
- [ ] Dominio propio; `CLIENT_URL` y la URL de Fly en `vercel.json` actualizadas
- [ ] Una compra de prueba completa con Mercado Pago y otra por transferencia
