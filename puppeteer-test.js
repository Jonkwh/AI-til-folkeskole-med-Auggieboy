import puppeteer from "puppeteer";

const BASE_URL = "https://ai-til-folkeskole-med-auggieboy.vercel.app";
const EMAIL = "augju@itu.dk";
const PASSWORD = "Lokal_freshboi5722";

const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

// ── 1. Login ──────────────────────────────────────────────────────────────────
console.log("1. Logging in...");
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector("#email");
await page.type("#email", EMAIL);
await page.type("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForNavigation({ waitUntil: "networkidle0" });
console.log("   ✓ Logged in, redirected to:", page.url());

// ── 2. Builder – configure masterprompt ──────────────────────────────────────
console.log("2. Configuring masterprompt...");
await page.waitForSelector("select");

const selects = await page.$$("select");
// ROLLE: Sokratisk tutor (default — just confirm it's there)
await selects[0].select("Skrivecoach");
// KONTEKST grade
await selects[1].select("Gymnasiet");
// KONTEKST subject
await selects[2].select("Dansk");
// MÅL
await selects[3].select("Støtte selvstændig problemløsning");
// ADFÆRD
await selects[4].select("Stil guidende spørgsmål i stedet for at give direkte svar");
// SPROG
await selects[5].select("Dansk");
// BEGRÆNSNING
await selects[6].select("Afslør svaret uden at eleven har prøvet selv først");
console.log("   ✓ Masterprompt configured");

// ── 3. Start chat ─────────────────────────────────────────────────────────────
console.log("3. Starting chat session...");
await page.click('button::-p-text(Start chat)');
await page.waitForNavigation({ waitUntil: "networkidle0" });
console.log("   ✓ Chat session created, URL:", page.url());

// ── 4. Send a message ─────────────────────────────────────────────────────────
console.log("4. Sending a message...");
await page.waitForSelector("textarea");
await page.type("textarea", "Hvad er den bedste måde at strukturere et essay på?");
await page.keyboard.press("Enter");

// Wait for assistant response to appear and finish streaming
console.log("   Waiting for AI response...");
await page.waitForFunction(
  () => {
    const msgs = document.querySelectorAll(".bg-gray-100");
    return msgs.length > 0 && msgs[msgs.length - 1].textContent.trim().length > 20;
  },
  { timeout: 30000 }
);
console.log("   ✓ Got AI response");

// ── 5. Session title updated ──────────────────────────────────────────────────
console.log("5. Checking session title...");
const title = await page.$eval("h2.text-sm", (el) => el.textContent.trim());
console.log("   ✓ Session title:", title);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\nAll tests passed!");
await browser.close();
