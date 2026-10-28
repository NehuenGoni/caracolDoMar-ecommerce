import multer from "multer";
import { BadRequestError } from "../utils/AppError.js";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * A diferencia del resto de las subidas (el navegador sube directo a Cloudinary con una firma),
 * acá el server necesita los bytes en memoria para mandárselos a Claude: por eso `memoryStorage`
 * en vez de un archivo temporal, y por eso se monta solo en la ruta de subir factura.
 */
export const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new BadRequestError("Formato no soportado (PDF, JPG, PNG o WEBP)"));
  },
});
