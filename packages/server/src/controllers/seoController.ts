import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as seoService from "../services/seoService.js";
import type { RenderPageQuery } from "../validators/seoValidators.js";

export const getSitemap = asyncHandler(async (_req: Request, res: Response) => {
  const xml = await seoService.buildSitemapXml();
  res.set("Cache-Control", "public, max-age=3600").type("application/xml").send(xml);
});

export const getRobots = (_req: Request, res: Response): void => {
  res.set("Cache-Control", "public, max-age=86400").type("text/plain").send(seoService.buildRobotsTxt());
};

export const renderPage = asyncHandler(async (req: Request, res: Response) => {
  const { path } = req.query as unknown as RenderPageQuery;
  const page = await seoService.renderPublicPage(path);
  res
    .status(page.status)
    .set("Cache-Control", "public, max-age=300")
    .type("html")
    .send(page.html);
});
