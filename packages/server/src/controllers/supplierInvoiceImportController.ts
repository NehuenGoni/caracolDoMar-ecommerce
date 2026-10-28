import type { Request, Response } from "express";
import { isInvoiceExtractionConfigured } from "../config/env.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import type { SupportedMimeType } from "../services/anthropicService.js";
import { signInvoiceFileUrl } from "../services/invoiceArchiveService.js";
import * as invoiceImportService from "../services/invoiceImportService.js";
import { getPricingSettings } from "../services/settingsService.js";
import { BadRequestError } from "../utils/AppError.js";
import type { MongoIdParam } from "../validators/commonValidators.js";
import type {
  ApplyImportBody,
  ImportLineParams,
  ImportQuery,
  UpdateImportHeaderInput,
  UpdateLineInput,
  UploadInvoiceBody,
} from "../validators/supplierInvoiceImportValidators.js";

export const uploadInvoice = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError("Falta el archivo de la factura (PDF, JPG, PNG o WEBP)");
  }
  const { supplierId } = req.body as UploadInvoiceBody;

  const doc = await invoiceImportService.createImport(
    {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype as SupportedMimeType,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
      supplierId,
    },
    req.user!.id,
  );
  res.status(201).json({ import: doc });
});

export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ extractionConfigured: isInvoiceExtractionConfigured });
});

export const listImports = asyncHandler(async (req: Request, res: Response) => {
  res.json(await invoiceImportService.listImports(req.query as unknown as ImportQuery));
});

export const getImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const doc = await invoiceImportService.getImportById(id);
  const { marginPercent, roundingStep } = await getPricingSettings();
  res.json({
    import: doc,
    fileUrl: signInvoiceFileUrl(doc.file),
    pricingDefaults: { marginPercent, roundingStep },
  });
});

export const updateImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const doc = await invoiceImportService.updateImportHeader(id, req.body as UpdateImportHeaderInput);
  res.json({ import: doc });
});

export const updateLine = asyncHandler(async (req: Request, res: Response) => {
  const { id, lineNumber } = req.params as unknown as ImportLineParams;
  const doc = await invoiceImportService.updateLine(id, lineNumber, req.body as UpdateLineInput);
  res.json({ import: doc });
});

export const applyImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  const result = await invoiceImportService.applyImport(id, req.body as ApplyImportBody, req.user!.id);
  res.json(result);
});

export const discardImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as MongoIdParam;
  await invoiceImportService.discardImport(id);
  res.status(204).send();
});
