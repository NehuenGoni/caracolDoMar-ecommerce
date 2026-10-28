import type { Types } from "mongoose";
import { Product } from "../models/Product.js";
import type { LineMatchMethod, LineMatchStatus } from "../models/SupplierInvoiceImport.js";
import { Supplier } from "../models/Supplier.js";
import { escapeRegex } from "../utils/regex.js";

/**
 * Matching determinístico y del lado nuestro: el LLM no elige productos, así que esto se prueba
 * sin red y no puede inventar un producto equivocado.
 *
 * Solo hace match exacto, en cascada con corte temprano:
 *   1. Código de barras exacto
 *   2. SKU normalizado exacto
 *   3. Sin match → el admin vincula a mano desde la pantalla de revisión
 */

export interface LineMatchInput {
  supplierSku: string;
  barcode: string;
}

export interface LineMatchResult {
  status: LineMatchStatus;
  method: LineMatchMethod;
  product: Types.ObjectId | null;
  variantSku: string;
  /** Precios actuales de la variante, en centavos, para mostrar la diferencia sin consultas extra. */
  currentCostPrice: number | null;
  currentPrice: number | null;
}

const UNMATCHED: Readonly<LineMatchResult> = Object.freeze({
  status: "unmatched",
  method: "none",
  product: null,
  variantSku: "",
  currentCostPrice: null,
  currentPrice: null,
});

/**
 * Normaliza un SKU para comparar el nuestro con el del proveedor sin que importe el formato:
 * mayúsculas y sin espacios, guiones, puntos ni barras. "sus-50 L" y "SUS50L" dan lo mismo.
 */
export function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-./]/g, "");
}

interface CatalogEntry {
  product: Types.ObjectId;
  variantSku: string;
  costPrice: number;
  price: number;
}

interface CatalogProductProjection {
  _id: Types.ObjectId;
  variants: { sku: string; barcode?: string; costPrice: number; price: number }[];
}

function toMatch(entry: CatalogEntry, method: "barcode" | "sku"): LineMatchResult {
  return {
    status: "matched",
    method,
    product: entry.product,
    variantSku: entry.variantSku,
    currentCostPrice: entry.costPrice,
    currentPrice: entry.price,
  };
}

/**
 * Resuelve el match de una tanda de líneas con un solo viaje a la base: arma dos índices (SKU y
 * código de barras) con las variantes del catálogo y resuelve cada línea contra ellos. El orden
 * del resultado espeja el de `inputs`. Los kits quedan afuera: no se les compra mercadería.
 */
export async function matchLines(inputs: LineMatchInput[]): Promise<LineMatchResult[]> {
  const products = await Product.find({ isBundle: { $ne: true } })
    .select("variants.sku variants.barcode variants.costPrice variants.price")
    .lean<CatalogProductProjection[]>();

  const bySku = new Map<string, CatalogEntry>();
  const byBarcode = new Map<string, CatalogEntry>();

  for (const product of products) {
    for (const variant of product.variants) {
      const entry: CatalogEntry = {
        product: product._id,
        variantSku: variant.sku,
        costPrice: variant.costPrice,
        price: variant.price,
      };
      bySku.set(normalizeSku(variant.sku), entry);
      if (variant.barcode) byBarcode.set(variant.barcode, entry);
    }
  }

  return inputs.map((input) => {
    const byBarcodeEntry = input.barcode ? byBarcode.get(input.barcode) : undefined;
    if (byBarcodeEntry) return toMatch(byBarcodeEntry, "barcode");

    const bySkuEntry = input.supplierSku ? bySku.get(normalizeSku(input.supplierSku)) : undefined;
    if (bySkuEntry) return toMatch(bySkuEntry, "sku");

    return { ...UNMATCHED };
  });
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

/**
 * Sugiere el proveedor registrado al que corresponde una factura: primero por CUIT (ignorando
 * guiones y espacios) y, si el CUIT no vino o no coincide, por nombre exacto sin distinguir
 * mayúsculas. Solo sugiere: el admin lo confirma o cambia en la revisión.
 */
export async function matchSupplier(
  name: string,
  taxId: string,
): Promise<{ id: Types.ObjectId; name: string } | null> {
  const digits = onlyDigits(taxId);
  if (digits.length >= 8) {
    const suppliers = await Supplier.find({ isActive: true, taxId: { $ne: "" } }).select("name taxId");
    const byTaxId = suppliers.find((s) => onlyDigits(s.taxId) === digits);
    if (byTaxId) return { id: byTaxId._id, name: byTaxId.name };
  }

  const trimmed = name.trim();
  if (!trimmed) return null;
  const byName = await Supplier.findOne({
    isActive: true,
    name: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" },
  }).select("name");
  return byName ? { id: byName._id, name: byName.name } : null;
}
