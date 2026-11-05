// Gera assets/banner.png a partir de assets/banner.html com Edge ou Chrome em modo headless.
// Uso: npm run banner   (ou defina BROWSER com o caminho do navegador)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const candidates = [
	process.env.BROWSER,
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/microsoft-edge",
].filter(Boolean);

const browser = candidates.find((path) => existsSync(path));
if (!browser) {
	console.error("Nenhum Edge ou Chrome encontrado. Defina BROWSER com o caminho do navegador.");
	process.exit(1);
}

const html = pathToFileURL(resolve("assets/banner.html")).href;
const png = resolve("assets/banner.png");

execFileSync(browser, [
	"--headless=new",
	"--disable-gpu",
	"--hide-scrollbars",
	"--force-device-scale-factor=1",
	"--window-size=1280,640",
	// Dá tempo para as fontes do Google Fonts carregarem.
	"--virtual-time-budget=5000",
	`--screenshot=${png}`,
	html,
], { stdio: "inherit" });

console.log(`Banner salvo em ${png}`);
