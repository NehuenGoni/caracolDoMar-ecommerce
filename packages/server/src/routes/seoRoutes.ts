import { Router } from "express";
import * as seoController from "../controllers/seoController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { renderPageQuerySchema } from "../validators/seoValidators.js";

/**
 * Público. Vercel reescribe `/sitemap.xml` y `/robots.txt` de la tienda hacia acá, y su middleware
 * pide `/render` cuando la visita es de un bot (Google, WhatsApp, Instagram…).
 */
export const seoRouter = Router();

seoRouter.get("/sitemap.xml", seoController.getSitemap);
seoRouter.get("/robots.txt", seoController.getRobots);
seoRouter.get("/render", validateRequest(renderPageQuerySchema, "query"), seoController.renderPage);
