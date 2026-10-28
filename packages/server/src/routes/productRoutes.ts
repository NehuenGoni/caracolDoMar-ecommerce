import { Router } from "express";
import * as productController from "../controllers/productController.js";
import { optionalAuthenticate } from "../middleware/authenticate.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { listProductsQuerySchema } from "../validators/productValidators.js";

export const productRouter = Router();

productRouter.get(
  "/",
  optionalAuthenticate,
  validateRequest(listProductsQuerySchema, "query"),
  productController.listProducts,
);
// Antes de "/:slug": si no, "facets" se interpretaría como un slug.
productRouter.get("/facets", productController.getFacets);
productRouter.get("/:slug", optionalAuthenticate, productController.getProductBySlug);
