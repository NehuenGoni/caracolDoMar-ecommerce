import { Router } from "express";
import * as settingsController from "../controllers/settingsController.js";

/** Lo público de la configuración: solo el aviso de la tienda. */
export const settingsRouter = Router();

settingsRouter.get("/announcement", settingsController.getPublicAnnouncement);
