import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { getInvoiceImport, type ImportDetail } from "@/lib/invoiceImportsApi";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Trae una importación y, mientras esté "uploaded" o "extracting" (la lectura por IA corre en
 * segundo plano en el server), la vuelve a pedir cada 3 segundos hasta que salga de esos estados
 * o pasen 3 minutos.
 *
 * El intervalo se arma una sola vez por id (no en cada respuesta): reiniciarlo en cada refresco
 * reiniciaría también el conteo de los 3 minutos y el corte por tiempo nunca llegaría. Por eso el
 * estado más reciente se lee de un ref dentro del tick.
 */
export function useInvoiceImport(id: string | undefined) {
  const [data, setData] = useState<ImportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<ImportDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const result = await getInvoiceImport(id);
      dataRef.current = result;
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar la importación");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!id) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const status = dataRef.current?.import.status;
      const stillReading = status === "uploaded" || status === "extracting";
      if (!stillReading || Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        return;
      }
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, refresh]);

  return { data, isLoading, error, refresh };
}
