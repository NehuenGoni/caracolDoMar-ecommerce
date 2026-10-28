import type { Supplier } from "@caracol/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { SupplierForm } from "@/components/admin/SupplierForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Spinner } from "@/components/ui/Spinner";
import { useSuppliers } from "@/hooks/admin/useSuppliers";
import { ApiError } from "@/lib/apiClient";
import { createSupplier, deleteSupplier, updateSupplier, type SupplierInput } from "@/lib/suppliersApi";

export default function AdminSuppliers() {
  const { suppliers, isLoading, error, reload } = useSuppliers(true);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSubmit(input: SupplierInput) {
    if (editing && editing !== "new") {
      await updateSupplier(editing._id, input);
    } else {
      await createSupplier(input);
    }
    setEditing(null);
    reload();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteSupplier(pendingDelete._id);
      setPendingDelete(null);
      reload();
    } catch (err) {
      setPendingDelete(null);
      setActionError(err instanceof ApiError ? err.message : "No pudimos eliminar el proveedor");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl text-text">Proveedores</h1>
        {editing === null && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <AnimatePresence>
        {editing !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <Card>
              <p className="mb-4 font-display text-lg text-text">
                {editing === "new" ? "Nuevo proveedor" : `Editar "${editing.name}"`}
              </p>
              <SupplierForm
                initialValue={editing === "new" ? undefined : editing}
                onSubmit={handleSubmit}
                onCancel={() => setEditing(null)}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {(error || actionError) && <InlineMessage tone="error">{error ?? actionError}</InlineMessage>}

      {isLoading ? (
        <Spinner />
      ) : suppliers.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {suppliers.map((supplier) => (
            <div key={supplier._id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{supplier.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") ||
                    "Sin datos de contacto"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!supplier.isActive && <Badge tone="neutral">Inactivo</Badge>}
                <button
                  type="button"
                  onClick={() => setEditing(supplier)}
                  aria-label={`Editar ${supplier.name}`}
                  className="flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-alt"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(supplier)}
                  aria-label={`Eliminar ${supplier.name}`}
                  className="flex size-8 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Store}
          title="Todavía no cargaste proveedores"
          description="Cargalos para asignarlos a tus compras y productos."
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este proveedor?"
        description="Si ya tiene productos o compras asociados no se puede eliminar: desactivalo en su lugar."
        confirmLabel="Eliminar"
        tone="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
