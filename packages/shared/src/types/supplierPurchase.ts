export interface SupplierPurchaseItem {
  product: string;
  variantSku: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface SupplierPurchase {
  _id: string;
  /** Proveedor registrado; las compras viejas o cargadas a mano pueden no tenerlo. */
  supplier?: string;
  /** Nombre del proveedor al momento de la compra (queda aunque el proveedor cambie). */
  supplierName: string;
  items: SupplierPurchaseItem[];
  totalCost: number;
  purchaseDate: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}
