import { describe, expect, it } from "vitest";
import { isCrawler } from "./crawlers";

describe("isCrawler", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ])("reconoce a %s", (ua) => {
    expect(isCrawler(ua)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Instagram 300.0.0",
  ])("deja pasar a una persona: %s", (ua) => {
    expect(isCrawler(ua)).toBe(false);
  });

  it("sin user-agent no es un bot", () => {
    expect(isCrawler(null)).toBe(false);
    expect(isCrawler("")).toBe(false);
  });
});
