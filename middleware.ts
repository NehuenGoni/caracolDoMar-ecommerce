/**
 * Middleware de Vercel (corre antes de servir la SPA). Si la visita es de un bot — Google, o la vista
 * previa de un link en WhatsApp/Instagram — le devuelve el HTML con título, descripción, imagen y
 * JSON-LD que arma el server (`GET /api/seo/render`). Las personas siguen de largo hacia la SPA.
 *
 * Si el server no responde a tiempo (Fly lo apaga cuando no hay tráfico y tarda en arrancar) o
 * falla, el bot recibe la SPA de siempre: nunca se le corta la página a nadie por esto.
 */
import { isCrawler } from "./packages/client/src/lib/crawlers";

declare const process: { env: Record<string, string | undefined> };

export const config = { matcher: ["/", "/catalogo", "/productos/:path*"] };

const TIMEOUT_MS = 8000;

export default async function middleware(request: Request): Promise<Response | undefined> {
  const apiUrl = process.env.VITE_API_URL;
  if (!apiUrl || !isCrawler(request.headers.get("user-agent"))) return undefined;

  const url = new URL(request.url);
  const target = `${apiUrl.replace(/\/+$/, "")}/seo/render?path=${encodeURIComponent(url.pathname + url.search)}`;

  try {
    const res = await fetch(target, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 500) return undefined;
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": res.headers.get("cache-control") ?? "public, max-age=300",
        vary: "user-agent",
      },
    });
  } catch {
    return undefined;
  }
}
