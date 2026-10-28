import type { FilterQuery } from "mongoose";
import { Product } from "../models/Product.js";
import { Supplier, type ISupplier, type SupplierDocument } from "../models/Supplier.js";
import { SupplierPurchase } from "../models/SupplierPurchase.js";
import { ConflictError, NotFoundError } from "../utils/AppError.js";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "../validators/supplierValidators.js";

export async function listSuppliers(query: ListSuppliersQuery): Promise<SupplierDocument[]> {
  const filter: FilterQuery<ISupplier> = query.includeInactive ? {} : { isActive: true };
  return Supplier.find(filter).sort({ name: 1 });
}

export async function getSupplierById(id: string): Promise<SupplierDocument> {
  const supplier = await Supplier.findById(id);
  if (!supplier) throw new NotFoundError("Proveedor no encontrado");
  return supplier;
}

export async function createSupplier(input: CreateSupplierInput): Promise<SupplierDocument> {
  return Supplier.create(input);
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<SupplierDocument> {
  const supplier = await getSupplierById(id);
  Object.assign(supplier, input);
  await supplier.save();
  return supplier;
}

/** Un proveedor con productos o compras no se borra (se perdería el historial): se desactiva. */
export async function deleteSupplier(id: string): Promise<void> {
  const supplier = await getSupplierById(id);
  const [hasProducts, hasPurchases] = await Promise.all([
    Product.exists({ supplier: id }),
    SupplierPurchase.exists({ supplier: id }),
  ]);
  if (hasProducts || hasPurchases) {
    throw new ConflictError("No se puede eliminar: tiene productos o compras asociados. Desactivalo en su lugar.");
  }
  await supplier.deleteOne();
}
