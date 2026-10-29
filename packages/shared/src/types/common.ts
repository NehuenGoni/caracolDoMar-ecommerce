export type Role = "customer" | "seller" | "admin";

export type ImageSource = "cloudinary" | "external";

export interface ImageRef {
  url: string;
  source: ImageSource;
  alt?: string;
  order: number;
}

/** Video corto de producto (los reels que ya usa la tienda para mostrarlo). */
export interface VideoRef {
  url: string;
  source: ImageSource;
  order: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}

export interface WithTimestamps {
  createdAt: string;
  updatedAt: string;
}
