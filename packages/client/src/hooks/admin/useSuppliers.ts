import { listSuppliers } from "@/lib/suppliersApi";
import { useAsyncResource } from "./useAsyncResource";

export function useSuppliers(includeInactive = false) {
  const { data, isLoading, error, reload } = useAsyncResource(
    () => listSuppliers(includeInactive).then((result) => result.suppliers),
    `suppliers:${includeInactive}`,
    "No pudimos cargar los proveedores",
  );
  return { suppliers: data ?? [], isLoading, error, reload };
}
