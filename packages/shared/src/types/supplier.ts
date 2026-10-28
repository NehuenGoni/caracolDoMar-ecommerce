import type { WithTimestamps } from "./common.js";

export interface Supplier extends WithTimestamps {
  _id: string;
  name: string;
  /** CUIT. */
  taxId: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
}
