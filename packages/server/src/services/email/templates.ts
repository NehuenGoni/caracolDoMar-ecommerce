import type { OrderStatus, StaffRole } from "@caracol/shared";
import { ROLE_LABELS, formatMoney } from "@caracol/shared";
import { escapeHtml } from "../../utils/html.js";

interface EmailTemplate {
  subject: string;
  html: string;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente de pago",
  confirmed: "Confirmado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/** La paleta de la tienda (client/src/styles/tokens.css, modo claro). */
const BRAND = {
  bg: "#F4ECDF",
  surface: "#FBF6EE",
  text: "#2F2219",
  textMuted: "#6F5B49",
  primary: "#5C3B26",
  onPrimary: "#FBF6EE",
};

/**
 * Logotipo en texto, igual que en la tienda: no depende de que el cliente de correo muestre imágenes.
 * Cuando esté el logo de Caracol en `client/public/`, se puede volver a una <img>.
 */
function logoHtml(): string {
  return `<p style="margin:0 0 24px;text-align:center;font-family:Georgia,serif;font-size:28px;font-weight:bold;color:${BRAND.text};">Caracol <span style="font-style:italic;font-weight:normal;color:#745820;">do Mar</span></p>`;
}

function wrapper(title: string, bodyHtml: string): string {
  return `
    <div style="background:${BRAND.bg};padding:32px 16px;font-family:Georgia,serif;color:${BRAND.text};">
      <div style="max-width:480px;margin:0 auto;background:${BRAND.surface};border-radius:8px;padding:32px;">
        ${logoHtml()}
        <h2 style="margin:0 0 16px;font-size:16px;color:${BRAND.text};">${title}</h2>
        ${bodyHtml}
      </div>
    </div>
  `;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${BRAND.primary};color:${BRAND.onPrimary};text-decoration:none;border-radius:6px;">${label}</a>`;
}

export function welcomeTemplate(firstName: string): EmailTemplate {
  return {
    subject: "¡Bienvenido/a a Caracol do Mar!",
    html: wrapper(
      `Hola ${firstName}, ¡gracias por sumarte!`,
      `<p style="color:${BRAND.textMuted};">Ya podés explorar nuestro catálogo y armar tu pedido cuando quieras.</p>`,
    ),
  };
}

export function passwordResetTemplate(firstName: string, resetUrl: string): EmailTemplate {
  return {
    subject: "Restablecé tu contraseña",
    html: wrapper(
      `Hola ${firstName}`,
      `<p style="color:${BRAND.textMuted};">Recibimos una solicitud para restablecer tu contraseña. Si fuiste vos, hacé clic en el botón. Si no, podés ignorar este email.</p>${button(resetUrl, "Restablecer contraseña")}<p style="color:${BRAND.textMuted};font-size:12px;margin-top:16px;">El link vence en 1 hora.</p>`,
    ),
  };
}

export function adminInviteTemplate(inviteUrl: string, role: StaffRole): EmailTemplate {
  const label = ROLE_LABELS[role];
  return {
    subject: "Te invitaron a sumarte al equipo de Caracol do Mar",
    html: wrapper(
      `Te invitaron como ${label}`,
      `<p style="color:${BRAND.textMuted};">Hacé clic en el botón para aceptar la invitación y crear tu cuenta. Vas a entrar al panel como ${label}.</p>${button(inviteUrl, "Aceptar invitación")}<p style="color:${BRAND.textMuted};font-size:12px;margin-top:16px;">La invitación vence en 7 días.</p>`,
    ),
  };
}

export function adminPromotedTemplate(firstName: string, role: StaffRole): EmailTemplate {
  const label = ROLE_LABELS[role];
  return {
    subject: `Ahora sos ${label} de Caracol do Mar`,
    html: wrapper(
      `Hola ${firstName}`,
      `<p style="color:${BRAND.textMuted};">Tu cuenta ahora tiene el rol de ${label}. Ya podés entrar al panel.</p>`,
    ),
  };
}

export function adminRevokedTemplate(firstName: string): EmailTemplate {
  return {
    subject: "Tu acceso al panel de Caracol do Mar fue revocado",
    html: wrapper(
      `Hola ${firstName}`,
      `<p style="color:${BRAND.textMuted};">Ya no tenés acceso al panel de Caracol do Mar. Tu cuenta sigue activa como cliente.</p>`,
    ),
  };
}

export function orderConfirmationTemplate(
  firstName: string,
  order: { orderNumber: number; total: number },
): EmailTemplate {
  return {
    subject: `Confirmamos tu pedido #${order.orderNumber}`,
    html: wrapper(
      `Hola ${firstName}, ¡tu pago fue aprobado!`,
      `<p style="color:${BRAND.textMuted};">Tu pedido <strong>#${order.orderNumber}</strong> por un total de <strong>${formatMoney(order.total)}</strong> ya está confirmado y lo estamos preparando.</p>`,
    ),
  };
}

export function transferInstructionsTemplate(
  firstName: string,
  data: {
    orderNumber: number;
    total: number;
    expiresAt: Date;
    transfer: { accountHolder: string; bankName: string; cbu: string; alias: string; taxId: string; instructions: string };
  },
): EmailTemplate {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:3px 12px 3px 0;color:${BRAND.textMuted};">${label}</td><td style="padding:3px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`
      : "";
  const deadline = data.expiresAt.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "long",
    timeStyle: "short",
  });
  return {
    subject: `Datos para transferir tu pedido #${data.orderNumber}`,
    html: wrapper(
      `Hola ${firstName}, recibimos tu pedido`,
      `<p style="color:${BRAND.textMuted};">Para confirmar el pedido <strong>#${data.orderNumber}</strong> transferí <strong>${formatMoney(data.total)}</strong> a esta cuenta y subí el comprobante desde <em>Mis pedidos</em>:</p>
      <table style="font-size:14px;margin:12px 0;">
        ${row("Titular", data.transfer.accountHolder)}
        ${row("Banco", data.transfer.bankName)}
        ${row("CBU/CVU", data.transfer.cbu)}
        ${row("Alias", data.transfer.alias)}
        ${row("CUIT/CUIL", data.transfer.taxId)}
      </table>
      ${data.transfer.instructions ? `<p style="color:${BRAND.textMuted};">${escapeHtml(data.transfer.instructions)}</p>` : ""}
      <p style="color:${BRAND.textMuted};font-size:12px;">Guardamos tus productos hasta el ${deadline}. Si para entonces no subiste el comprobante, el pedido se cancela.</p>`,
    ),
  };
}

export function transferRejectedTemplate(
  firstName: string,
  data: { orderNumber: number; note?: string; expiresAt: Date },
): EmailTemplate {
  const deadline = data.expiresAt.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "long",
    timeStyle: "short",
  });
  return {
    subject: `No pudimos confirmar el pago de tu pedido #${data.orderNumber}`,
    html: wrapper(
      `Hola ${firstName}`,
      `<p style="color:${BRAND.textMuted};">No pudimos confirmar la transferencia de tu pedido <strong>#${data.orderNumber}</strong>${data.note ? `: ${escapeHtml(data.note)}` : "."}</p>
      <p style="color:${BRAND.textMuted};">Podés subir un comprobante válido desde <em>Mis pedidos</em> hasta el ${deadline}.</p>`,
    ),
  };
}

export function orderStatusChangeTemplate(
  firstName: string,
  order: { orderNumber: number },
  newStatus: OrderStatus,
): EmailTemplate {
  const label = ORDER_STATUS_LABELS[newStatus];
  return {
    subject: `Tu pedido #${order.orderNumber}: ${label}`,
    html: wrapper(
      `Hola ${firstName}`,
      `<p style="color:${BRAND.textMuted};">El estado de tu pedido <strong>#${order.orderNumber}</strong> cambió a: <strong>${label}</strong>.</p>`,
    ),
  };
}

export interface StoreSaleReceiptData {
  saleNumber: number;
  createdAt: Date;
  items: { productName: string; variantLabel: string; quantity: number; subtotal: number }[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethodLabel: string;
  customerName?: string;
}

/** Ticket de una compra en el local. Comprobante no fiscal: no reemplaza a una factura. */
export function storeSaleReceiptTemplate(
  sale: StoreSaleReceiptData,
  store: { address?: string; hours?: string },
): EmailTemplate {
  const rows = sale.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;">${item.quantity} × ${escapeHtml(item.productName)} ${item.variantLabel ? `<span style="color:${BRAND.textMuted};">(${escapeHtml(item.variantLabel)})</span>` : ""}</td><td style="padding:4px 0;text-align:right;">${formatMoney(item.subtotal)}</td></tr>`,
    )
    .join("");
  const discountRow =
    sale.discountAmount > 0
      ? `<tr><td style="padding:4px 0;color:${BRAND.textMuted};">Descuento</td><td style="padding:4px 0;text-align:right;">-${formatMoney(sale.discountAmount)}</td></tr>`
      : "";
  const date = sale.createdAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const greeting = sale.customerName ? `Hola ${escapeHtml(sale.customerName)}, ` : "";
  const storeInfo = [store.address, store.hours]
    .filter((v): v is string => Boolean(v))
    .map((v) => escapeHtml(v))
    .join(" · ");

  return {
    subject: `Tu ticket de compra #${sale.saleNumber}`,
    html: wrapper(
      `${greeting}gracias por tu compra`,
      `<p style="color:${BRAND.textMuted};margin:0 0 12px;">Ticket <strong>#${sale.saleNumber}</strong> · ${date}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
        <tr><td colspan="2" style="border-top:1px solid ${BRAND.bg};padding-top:4px;"></td></tr>
        <tr><td style="padding:4px 0;color:${BRAND.textMuted};">Subtotal</td><td style="padding:4px 0;text-align:right;">${formatMoney(sale.subtotal)}</td></tr>
        ${discountRow}
        <tr><td style="padding:4px 0;"><strong>Total</strong></td><td style="padding:4px 0;text-align:right;"><strong>${formatMoney(sale.total)}</strong></td></tr>
        <tr><td style="padding:4px 0;color:${BRAND.textMuted};">Pago</td><td style="padding:4px 0;text-align:right;">${escapeHtml(sale.paymentMethodLabel)}</td></tr>
      </table>
      ${storeInfo ? `<p style="color:${BRAND.textMuted};font-size:12px;margin-top:16px;">${storeInfo}</p>` : ""}
      <p style="color:${BRAND.textMuted};font-size:12px;margin-top:8px;">Comprobante no válido como factura.</p>`,
    ),
  };
}

export interface WithdrawalEmailData {
  requestNumber: number;
  orderNumber: number;
  fullName: string;
  email: string;
  reason?: string;
  needsReview: boolean;
  createdAt: Date;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** Constancia al cliente: la Res. 424/2020 exige confirmar la recepción del trámite. */
export function withdrawalConfirmationTemplate(data: WithdrawalEmailData): EmailTemplate {
  return {
    subject: `Recibimos tu solicitud de arrepentimiento #${data.requestNumber}`,
    html: wrapper(
      `Hola ${escapeHtml(data.fullName)}, recibimos tu solicitud`,
      `<p style="color:${BRAND.textMuted};">Registramos tu solicitud de arrepentimiento para el pedido <strong>#${data.orderNumber}</strong>.</p>
      <p style="color:${BRAND.textMuted};">Nº de trámite: <strong>${data.requestNumber}</strong><br/>Fecha: ${formatDateTime(data.createdAt)}</p>
      <p style="color:${BRAND.textMuted};">Nos vamos a poner en contacto con vos para coordinar la devolución y el reembolso.</p>`,
    ),
  };
}

export function withdrawalNotificationTemplate(data: WithdrawalEmailData, orderMatched: boolean): EmailTemplate {
  const warning = !orderMatched
    ? "El pedido y el email no coinciden con ningún registro: verificar manualmente."
    : data.needsReview
      ? "El pedido está fuera del plazo de 10 días: revisar manualmente."
      : "";
  return {
    subject: `Arrepentimiento #${data.requestNumber} — pedido #${data.orderNumber}`,
    html: wrapper(
      "Nueva solicitud de arrepentimiento",
      `${warning ? `<p style="color:#B3261E;"><strong>${warning}</strong></p>` : ""}
      <p style="color:${BRAND.textMuted};">Trámite <strong>#${data.requestNumber}</strong> · ${formatDateTime(data.createdAt)}<br/>
      Pedido: <strong>#${data.orderNumber}</strong><br/>
      Nombre: ${escapeHtml(data.fullName)}<br/>
      Email: ${escapeHtml(data.email)}<br/>
      Motivo: ${data.reason ? escapeHtml(data.reason) : "—"}</p>`,
    ),
  };
}
