// Prints the host manual to PDF with Chrome (Thai needs a real text shaper).
//   node docs/host-manual/build.mjs
// Reads manual.html next to this file, writes peaksnature-host-manual.pdf beside it.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(here, "manual.html")).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Without the web fonts Chrome falls back to a wider system font and the layout shifts.
  const fontsOk = await page.evaluate(() => document.fonts.check('16px "Anuphan"', "ก") && document.fonts.check('700 16px "Noto Serif Thai"', "ก"));
  if (!fontsOk) throw new Error("Anuphan / Noto Serif Thai did not load (needs fonts.googleapis.com); not writing the PDF.");
  await page.pdf({
    path: join(here, "peaksnature-host-manual.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  console.log("wrote", join(here, "peaksnature-host-manual.pdf"));
} finally {
  await browser.close();
}
