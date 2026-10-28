import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InvoiceImportStatusBadge } from "@/components/admin/InvoiceImportStatusBadge";
import { InvoiceUploadCard } from "@/components/admin/InvoiceUploadCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { useAsyncResource } from "@/hooks/admin/useAsyncResource";
import { getInvoiceImportStatus, listInvoiceImports } from "@/lib/invoiceImportsApi";

export default function AdminInvoiceImports() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  // Hasta saber si está configurada se asume que sí: el server igual avisa si no lo está.
  const [extractionConfigured, setExtractionConfigured] = useState(true);
  const { data, isLoading, error } = useAsyncResource(
    () => listInvoiceImports(page),
    `invoice-imports:${page}`,
    "No pudimos cargar las importaciones",
  );

  useEffect(() => {
    getInvoiceImportStatus()
      .then((status) => setExtractionConfigured(status.extractionConfigured))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/admin/compras" className="text-sm text-text-muted hover:text-text">
          ← Volver a compras
        </Link>
        <h1 className="mt-1 font-display text-2xl text-text">Importar factura de proveedor</h1>
      </div>

      <InvoiceUploadCard
        extractionConfigured={extractionConfigured}
        onUploaded={(imp) => navigate(`/admin/compras/importaciones/${imp._id}`)}
      />

      <h2 className="font-display text-lg text-text">Importaciones recientes</h2>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-accent2-deep">{error}</p>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {data.items.map((imp) => (
              <Link
                key={imp._id}
                to={`/admin/compras/importaciones/${imp._id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-alt"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{imp.supplier || "Proveedor sin detectar"}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(imp.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                    {imp.documentNumber && ` · Nº ${imp.documentNumber}`}
                    {imp.lines.length > 0 && ` · ${imp.lines.length} línea${imp.lines.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <InvoiceImportStatusBadge status={imp.status} />
              </Link>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      ) : (
        <EmptyState icon={FileText} title="Todavía no importaste ninguna factura" />
      )}
    </div>
  );
}
