import { z } from "zod";

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser AAAA-MM-DD");

const range = {
  /** Día de Argentina, incluido. Por defecto: el primer día del mes. */
  from: dayKey.optional(),
  /** Día de Argentina, incluido. Por defecto: hoy. */
  to: dayKey.optional(),
};

const groupBy = z.enum(["day", "week", "month"]).default("day");
const sort = z.enum(["revenue", "units", "profit"]).default("revenue");
const topLimit = z.coerce.number().int().min(1).max(100).default(10);
const days = z.coerce.number().int().min(1).max(730).default(60);
const slowLimit = z.coerce.number().int().min(1).max(200).default(100);

export const salesReportQuerySchema = z.object({ ...range, groupBy });
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

export const topProductsQuerySchema = z.object({ ...range, sort, limit: topLimit });
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

export const slowMoversQuerySchema = z.object({ days, limit: slowLimit });
export type SlowMoversQuery = z.infer<typeof slowMoversQuerySchema>;

export const exportReportQuerySchema = z.object({
  kind: z.enum(["sales", "products", "inventory", "slow-movers"]),
  ...range,
  groupBy,
  sort,
  limit: z.coerce.number().int().min(1).max(200).default(100),
  days,
});
export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;
