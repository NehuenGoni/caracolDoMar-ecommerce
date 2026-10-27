import type { Category } from "@caracol/shared";
import { apiGet } from "./apiClient.js";

export const listCategories = () => apiGet<{ categories: Category[] }>("/categories");

export const getCategoryBySlug = (slug: string) => apiGet<{ category: Category }>(`/categories/${slug}`);
