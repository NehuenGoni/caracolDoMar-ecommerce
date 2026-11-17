# 10: Aceptar una invitación aplica el rol de inmediato

**Qué construir:** Al aceptar una invitación, el rol nuevo rige al instante (se invalida la caché de auth, como exige la convención) y, si la cuenta ya existía, se revocan sus sesiones anteriores porque se le cambió la contraseña.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Se llama a `invalidateAuthCache` al aceptar
- [ ] Sesiones previas de la cuenta existente revocadas
- [ ] Test: el rol nuevo aplica en la request siguiente
