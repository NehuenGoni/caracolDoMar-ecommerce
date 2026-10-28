import type { Order, TransferInstructions } from "@caracol/shared";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTransferInstructions } = vi.hoisted(() => ({ getTransferInstructions: vi.fn() }));

vi.mock("@/lib/ordersApi", () => ({
  getTransferInstructions,
  attachReceipt: vi.fn(),
  signReceiptUpload: vi.fn(),
}));

import { TransferInstructionsCard } from "./TransferInstructionsCard";

function order(overrides: Partial<Order> = {}): Order {
  return {
    _id: "order-1",
    orderNumber: 7,
    status: "pending",
    paymentMethod: "transfer",
    paymentStatus: "pending",
    ...overrides,
  } as Order;
}

function instructions(overrides: Partial<TransferInstructions> = {}): TransferInstructions {
  return {
    transfer: {
      enabled: true,
      accountHolder: "Caracol do Mar SRL",
      bankName: "Banco Galicia",
      cbu: "0070000030000012345678",
      alias: "caracol.do.mar",
      taxId: "30-12345678-9",
      instructions: "Poné el número de pedido en el concepto.",
    },
    orderNumber: 7,
    amount: 300000,
    expiresAt: "2026-11-01T15:00:00.000Z",
    paymentStatus: "pending",
    ...overrides,
  };
}

function renderCard(o: Order) {
  return render(<TransferInstructionsCard order={o} onOrderChange={() => {}} />);
}

beforeEach(() => {
  getTransferInstructions.mockReset();
});

describe("TransferInstructionsCard", () => {
  it("muestra a dónde transferir, el importe y permite subir el comprobante", async () => {
    getTransferInstructions.mockResolvedValue(instructions());
    renderCard(order());

    expect(await screen.findByText("Caracol do Mar SRL")).toBeInTheDocument();
    expect(screen.getByText("0070000030000012345678")).toBeInTheDocument();
    expect(screen.getByText("caracol.do.mar")).toBeInTheDocument();
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Poné el número de pedido en el concepto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /subir comprobante/i })).toBeInTheDocument();
    expect(screen.getByText(/Guardamos tus productos hasta el/)).toBeInTheDocument();
  });

  it("con el comprobante ya subido avisa que lo están revisando y no pide subir otro", async () => {
    getTransferInstructions.mockResolvedValue(instructions({ receiptUrl: "https://res.cloudinary.com/x/r.jpg" }));
    renderCard(order({ receiptUrl: "https://res.cloudinary.com/x/r.jpg" }));

    expect(await screen.findByText(/lo estamos revisando/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /subir comprobante/i })).not.toBeInTheDocument();
  });

  it("si rechazaron el comprobante lo dice y deja subir uno nuevo", async () => {
    getTransferInstructions.mockResolvedValue(instructions({ paymentStatus: "rejected" }));
    renderCard(order({ paymentStatus: "rejected" }));

    expect(await screen.findByText(/No pudimos confirmar el comprobante anterior/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /subir comprobante/i })).toBeInTheDocument();
  });

  it("con el pago confirmado no muestra los datos bancarios", async () => {
    getTransferInstructions.mockResolvedValue(instructions({ paymentStatus: "approved" }));
    renderCard(order({ paymentStatus: "approved", status: "confirmed" }));

    expect(await screen.findByText(/Recibimos tu transferencia/i)).toBeInTheDocument();
    expect(screen.queryByText("0070000030000012345678")).not.toBeInTheDocument();
  });

  it("un pedido cancelado explica por qué y no permite subir nada", async () => {
    getTransferInstructions.mockResolvedValue(instructions());
    renderCard(order({ status: "cancelled" }));

    expect(await screen.findByText(/se canceló porque no recibimos el comprobante/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /subir comprobante/i })).not.toBeInTheDocument();
  });

  it("si no se pueden cargar los datos muestra el error", async () => {
    getTransferInstructions.mockRejectedValue(new Error("falló"));
    renderCard(order());

    // El rechazo no es un ApiError: se muestra el mensaje genérico.
    expect(await screen.findByText(/No pudimos cargar los datos para transferir/i)).toBeInTheDocument();
  });
});
