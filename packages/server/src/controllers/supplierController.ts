import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import * as supplierService from "../services/supplierService.js";
import type { MongoIdParam } from "../validators/commonValidators.js";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "../validators/supplierValidators.js";

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const suppliers = await supplierService.listSuppliers(req.query as unknown as ListSuppliersQuery);
  res.json({ suppliers });
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  res.json({ supplier: await supplierService.getSupplierById(id) });
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await supplierService.createSupplier(req.body as CreateSupplierInput);
  res.status(201).json({ supplier });
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const supplier = await supplierService.updateSupplier(id, req.body as UpdateSupplierInput);
  res.json({ supplier });
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  await supplierService.deleteSupplier(id);
  res.status(204).send();
});
