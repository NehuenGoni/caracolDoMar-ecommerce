import type { ReactNode } from "react";

export interface TableColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Los números se alinean a la derecha, en columnas que se leen de arriba hacia abajo. */
  numeric?: boolean;
}

interface ReportTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: string;
  /** Una fila de cierre (totales). */
  footer?: ReactNode;
}

/**
 * Tabla de datos. Es el gemelo accesible de cada gráfico y, donde hay muchas columnas con
 * significado (productos), la forma principal de mostrarlos. Los números usan cifras tabulares
 * porque se leen en columna.
 */
export function ReportTable<T>({ columns, rows, rowKey, caption, empty = "No hay datos para este período.", footer }: ReportTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--viz-text-2)" }}>
        {empty}
      </p>
    );
  }

  return (
    <table className="w-full min-w-[32rem] border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--viz-axis)" }}>
          {columns.map((column) => (
            <th
              key={column.header}
              scope="col"
              className={`px-2 py-2 text-xs font-medium ${column.numeric ? "text-right" : "text-left"}`}
              style={{ color: "var(--viz-text-2)" }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} style={{ borderBottom: "1px solid var(--viz-grid)" }}>
            {columns.map((column) => (
              <td
                key={column.header}
                className={`px-2 py-2 ${column.numeric ? "text-right tabular-nums" : "text-left"}`}
                style={{ color: "var(--viz-text)" }}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && <tfoot style={{ borderTop: "1px solid var(--viz-axis)" }}>{footer}</tfoot>}
    </table>
  );
}
