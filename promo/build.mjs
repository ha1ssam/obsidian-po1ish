// Gera as imagens de divulgação em promo/images (ver promo/README.md).
// Uso: node promo/build.mjs [slide...]
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SLIDES = ["menu", "preview", "types", "markdown"];
const FORMATS = {
	portrait: { width: 540, height: 960 },
	landscape: { width: 900, height: 600 },
};

// Edge ou Chrome em modo headless (sem precisar instalar o Playwright).
const browser = [
	process.env.BROWSER,
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
].find((path) => path && existsSync(path));
if (!browser) {
	console.error("Nenhum Edge ou Chrome encontrado. Defina BROWSER com o caminho do navegador.");
	process.exit(1);
}

// As janelas reais do plugin, com a API do Obsidian trocada por substitutos.
await esbuild.build({
	entryPoints: [join(here, "harness.ts")],
	bundle: true,
	format: "iife",
	alias: { obsidian: join(here, "obsidian-stub.ts") },
	outfile: join(here, ".cache", "harness.js"),
	logLevel: "warning",
});

/** Espera o arquivo existir e parar de crescer (até 20 s). */
async function waitFor(path) {
	let size = -1;
	for (let i = 0; i < 100; i++) {
		if (existsSync(path)) {
			const now = statSync(path).size;
			if (now > 0 && now === size) return true;
			size = now;
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	return false;
}

const only = process.argv.slice(2);
const slides = only.length ? only : SLIDES;
const out = join(here, "images");
mkdirSync(out, { recursive: true });

for (const [format, { width, height }] of Object.entries(FORMATS)) {
	for (const slide of slides) {
		const url = pathToFileURL(join(here, "page.html"));
		url.search = `?s=${slide}&f=${format}`;
		const file = `${SLIDES.indexOf(slide) + 1}-${slide}-${format}.png`;
		// Um perfil por foto: com um perfil só, o Edge reaproveita a janela anterior e não salva nada.
		const profile = join(here, ".cache", `profile-${format}-${slide}`);
		if (existsSync(join(out, file))) unlinkSync(join(out, file));
		// 2x: 1080×1920 (vertical) e 1800×1200 (horizontal).
		execFileSync(browser, [
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			`--user-data-dir=${profile}`,
			"--force-device-scale-factor=2",
			`--window-size=${width},${height}`,
			// Dá tempo para as fontes carregarem e a prévia ficar pronta.
			"--virtual-time-budget=6000",
			`--screenshot=${join(out, file)}`,
			url.href,
		], { stdio: "ignore" });
		// No Windows o Edge pode voltar antes de gravar a foto: espera o arquivo aparecer.
		const saved = await waitFor(join(out, file));
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
		if (!saved) {
			console.error(`${file}: o navegador não salvou a imagem.`);
			process.exitCode = 1;
			continue;
		}
		console.log(file);
	}
}
