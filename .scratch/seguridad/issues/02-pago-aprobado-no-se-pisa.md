# 02: El pago aprobado no se pisa y se valida el monto

**Qué construir:** Una notificación posterior de Mercado Pago (un pago rechazado o pendiente del mismo pedido) ya no baja un pago aprobado a otro estado. Además, un pago cuyo monto o moneda no coinciden con el total del pedido no lo confirma: queda marcado para revisión del admin.

**Bloqueado por:** Ninguno (se puede empezar ya)

**Estado:** ready-for-agent

- [ ] Un `approved` solo cambia por reembolso o contracargo, no por otro pago rechazado
- [ ] Monto y moneda se comparan con el total; si difieren, se marca `paymentIssue` y no se confirma
- [ ] El pedido sigue siendo enviable al correo después de una notificación rechazada tardía
- [ ] Tests con notificaciones fuera de orden y con monto distinto
