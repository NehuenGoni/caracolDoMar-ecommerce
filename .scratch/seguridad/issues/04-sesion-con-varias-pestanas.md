# 04: La sesión sobrevive a refrescos simultáneos

**Qué construir:** Hoy, si dos pestañas refrescan la sesión a la vez con la misma cookie, la segunda parece un robo de token y se cierran todas las sesiones del usuario. La rotación pasa a ser atómica, con una ventana de gracia corta: las pestañas siguen logueadas, y el reuso real de un token viejo sigue revocando todo.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Rotación del refresh token atómica en el server
- [ ] Dos refrescos con el mismo token dentro de la ventana de gracia: ambos obtienen una sesión válida
- [ ] Reuso fuera de la ventana: se revocan todas las sesiones (como hoy)
- [ ] Tests de concurrencia y de reuso
