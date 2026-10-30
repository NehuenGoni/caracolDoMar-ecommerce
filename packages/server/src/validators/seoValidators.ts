import { z } from "zod";

export const renderPageQuerySchema = z.object({
  /** Ruta pública con su query, tal cual la pidió el bot: `/productos/vela-de-soja`. */
  path: z.string().trim().min(1).max(500).startsWith("/"),
});
export type RenderPageQuery = z.infer<typeof renderPageQuerySchema>;
