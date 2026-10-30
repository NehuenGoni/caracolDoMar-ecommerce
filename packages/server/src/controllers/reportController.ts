import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as reportService from "../services/reportService.js";
import type {
  ExportReportQuery,
  SalesReportQuery,
  SlowMoversQuery,
  TopProductsQuery,
} from "../validators/reportValidators.js";

export const getSales = asyncHandler(async (req: Request, res: Response) => {
  res.json(await reportService.getSalesReport(req.query as unknown as SalesReportQuery));
});

export const getTopProducts = asyncHandler(async (req: Request, res: Response) => {
  res.json({ products: await reportService.getTopProducts(req.query as unknown as TopProductsQuery) });
});

export const getInventory = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await reportService.getInventoryValuation());
});

export const getSlowMovers = asyncHandler(async (req: Request, res: Response) => {
  res.json({ items: await reportService.getSlowMovers(req.query as unknown as SlowMoversQuery) });
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const { filename, csv } = await reportService.buildReportCsv(req.query as unknown as ExportReportQuery);
  res
    .status(200)
    .set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Tiene costos y márgenes: que ningún proxy ni navegador lo guarde.
      "Cache-Control": "no-store",
    })
    .send(csv);
});
