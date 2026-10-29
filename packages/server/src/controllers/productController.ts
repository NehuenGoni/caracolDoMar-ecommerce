import { hasPermission } from "@caracol/shared";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as productService from "../services/productService.js";
import type {
  AdminListProductsQuery,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "../validators/productValidators.js";
import type { MongoIdParam } from "../validators/commonValidators.js";

function isAdminViewer(req: Request): boolean {
  return req.user?.role === "admin";
}

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListProductsQuery;
  const result = await productService.listPublicProducts(query, isAdminViewer(req));
  res.json(result);
});

export const getFacets = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await productService.getCatalogFacets());
});

export const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getPublicProductBySlug(
    req.params.slug as string,
    isAdminViewer(req),
  );
  res.json({ product });
});

/** El vendedor ve el catálogo en el panel, pero sin costos ni proveedores. */
const canSeeCosts = (req: Request) => hasPermission(req.user?.role, "costs:read");

export const adminListProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as AdminListProductsQuery;
  const result = await productService.listAdminProducts(query, canSeeCosts(req));
  res.json(result);
});

export const adminGetProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const product = await productService.getAdminProductById(id);
  res.json({ product: await productService.toAdminView(product, canSeeCosts(req)) });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateProductInput;
  const product = await productService.createProduct(input, req.user!.id);
  res.status(201).json({ product: await productService.toAdminView(product) });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const input = req.body as UpdateProductInput;
  const product = await productService.updateProduct(id, input, req.user!.id);
  res.json({ product: await productService.toAdminView(product) });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  await productService.deleteProduct(id);
  res.status(204).send();
});
