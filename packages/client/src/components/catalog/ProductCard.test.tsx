import type { Product } from "@caracol/shared";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProductCard } from "./ProductCard.js";

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: "1",
    name: "Vela Aromática",
    slug: "vela-aromatica",
    category: "cat-1",
    tags: [],
    isActive: true,
    isFeatured: false,
    images: [],
    videos: [],
    isBundle: false,
    bundleItems: [],
    variants: [
      {
        sku: "VELA-1",
        attributes: [{ name: "Color", value: "Verde" }],
        price: 250000,
        costPrice: 100000,
        stock: 5,
        lowStockThreshold: 1,
      },
    ],
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function renderCard(product: Product) {
  return render(
    <BrowserRouter>
      <ProductCard product={product} />
    </BrowserRouter>,
  );
}

describe("ProductCard", () => {
  it("muestra el nombre y el precio del producto", () => {
    renderCard(buildProduct());
    expect(screen.getByText("Vela Aromática")).toBeInTheDocument();
    expect(screen.getByText(/2\.500,00/)).toBeInTheDocument();
  });

  it("muestra 'Desde' cuando hay variantes con precios distintos", () => {
    renderCard(
      buildProduct({
        variants: [
          {
            sku: "VELA-1",
            attributes: [{ name: "Tamaño", value: "Chico" }],
            price: 200000,
            costPrice: 90000,
            stock: 5,
            lowStockThreshold: 1,
          },
          {
            sku: "VELA-2",
            attributes: [{ name: "Tamaño", value: "Grande" }],
            price: 350000,
            costPrice: 150000,
            stock: 5,
            lowStockThreshold: 1,
          },
        ],
      }),
    );
    expect(screen.getByText("Desde")).toBeInTheDocument();
  });

  it("indica sin stock cuando todas las variantes están agotadas", () => {
    renderCard(
      buildProduct({
        variants: [
          {
            sku: "VELA-1",
            attributes: [{ name: "Color", value: "Verde" }],
            price: 250000,
            costPrice: 100000,
            stock: 0,
            lowStockThreshold: 1,
          },
        ],
      }),
    );
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
  });

  it("marca los kits y las piezas únicas", () => {
    const { unmount } = renderCard(buildProduct({ isBundle: true }));
    expect(screen.getByText("Kit")).toBeInTheDocument();
    unmount();

    renderCard(
      buildProduct({
        variants: [
          { sku: "PIEDRA-1", attributes: [], price: 90000, costPrice: 20000, stock: 1, lowStockThreshold: 0, isUniquePiece: true },
        ],
      }),
    );
    expect(screen.getByText("Pieza única")).toBeInTheDocument();
  });

  it("no pone etiqueta de kit si no hay stock: manda 'Sin stock'", () => {
    renderCard(
      buildProduct({
        isBundle: true,
        variants: [
          { sku: "KIT-1", attributes: [], price: 400000, costPrice: 0, stock: 0, lowStockThreshold: 0 },
        ],
      }),
    );
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
    expect(screen.queryByText("Kit")).not.toBeInTheDocument();
  });
});
