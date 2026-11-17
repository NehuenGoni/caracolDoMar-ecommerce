# 09: Headers de seguridad en la SPA

**Qué construir:** La tienda servida por Vercel manda CSP (compatible con Cloudinary, Mercado Pago, Google Fonts y la API), `frame-ancestors 'none'`, HSTS, `Referrer-Policy` y `Permissions-Policy`. El panel de admin ya no se puede embeber en otro sitio (clickjacking).

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Primero en `Content-Security-Policy-Report-Only`, verificado en un preview de Vercel sin violaciones en Home, catálogo, checkout y panel
- [ ] Después, en modo bloqueante
- [ ] Un iframe de otro dominio no carga el sitio
