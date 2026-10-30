/**
 * Bots que leen la página sin ejecutar JavaScript (o que conviene que no dependan de él): buscadores
 * y las vistas previas de links de WhatsApp, Instagram/Facebook, Telegram, etc. A ellos el middleware
 * de Vercel (`middleware.ts`, en la raíz) les sirve el HTML que arma el server.
 */
const CRAWLER_PATTERN = new RegExp(
  [
    "googlebot",
    "google-inspectiontool",
    "bingbot",
    "yandex",
    "duckduckbot",
    "baiduspider",
    "slurp",
    "applebot",
    "facebookexternalhit",
    "facebookcatalog",
    "facebot",
    "meta-externalagent",
    "instagram",
    "whatsapp",
    "twitterbot",
    "telegrambot",
    "linkedinbot",
    "slackbot",
    "discordbot",
    "pinterest",
    "skypeuripreview",
    "redditbot",
    "embedly",
  ].join("|"),
  "i",
);

export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  // El navegador interno de Instagram dice "Instagram" pero es una persona: lleva un navegador real.
  if (/instagram/i.test(userAgent) && /mozilla\/5\.0 \((iphone|linux; android)/i.test(userAgent)) return false;
  return CRAWLER_PATTERN.test(userAgent);
}
