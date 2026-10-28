import { cloudinary } from "../config/cloudinary.js";
import { env } from "../config/env.js";

export interface ArchivedInvoiceFile {
  url: string;
  publicId: string;
  resourceType: string;
}

const FOLDER = "caracol/supplier-invoices";

/**
 * Archiva el PDF/foto original en Cloudinary como comprobante, en modo "authenticated" (no
 * público): una factura de proveedor tiene CUIT y costos. Es un canal secundario: el server ya
 * tiene los bytes en memoria y se los manda a Claude sin depender de esto, así que si falla no
 * debe tumbar la carga. Sin Cloudinary configurado (tests, desarrollo) no hace nada y devuelve
 * campos vacíos.
 */
export async function archiveInvoiceFile(buffer: Buffer, originalName: string): Promise<ArchivedInvoiceFile> {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return { url: "", publicId: "", resourceType: "" };
  }

  try {
    return await new Promise<ArchivedInvoiceFile>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: FOLDER,
          resource_type: "auto",
          type: "authenticated",
          use_filename: true,
          filename_override: originalName,
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error("Cloudinary no devolvió resultado"));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type });
        },
      );
      uploadStream.end(buffer);
    });
  } catch (err) {
    console.error("Error archivando la factura en Cloudinary:", err);
    return { url: "", publicId: "", resourceType: "" };
  }
}

/**
 * Firma una URL de vista previa para un archivo "authenticated": sin firmar, Cloudinary devuelve
 * 401. No pega a la red (arma la firma con el api_secret). Devuelve "" si el archivo nunca se
 * pudo archivar.
 */
export function signInvoiceFileUrl(file: { publicId: string; resourceType: string }): string {
  if (!file.publicId) return "";
  return cloudinary.url(file.publicId, {
    resource_type: file.resourceType || "raw",
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
}
