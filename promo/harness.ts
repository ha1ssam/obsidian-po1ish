// Expõe as janelas reais do plugin e os dados que as imagens de divulgação usam.
import { App } from "obsidian";
import { toSegments } from "../src/languagetool";
import { PreviewModal } from "../src/modals";

const app = new App();

/** Tira a janela do fundo escuro do Obsidian e põe dentro da imagem. */
function place(target: HTMLElement, container: HTMLElement): HTMLElement {
	const modal = container.querySelector<HTMLElement>(".modal")!;
	target.appendChild(modal);
	container.remove();
	(document.activeElement as HTMLElement | null)?.blur();
	return modal;
}

/** O plugin fala português; as imagens são em inglês. Troca os textos fixos da janela. */
const ENGLISH: Record<string, string> = {
	"Antes": "Before",
	"Depois (você pode editar)": "After (you can edit)",
	"Tentar de novo": "Try again",
	"Copiar": "Copy",
	"Aplicar": "Apply",
};
function translate(root: HTMLElement): void {
	root.querySelectorAll<HTMLElement>(".po1ish-label, button").forEach((el) => {
		const text = el.textContent ?? "";
		if (ENGLISH[text]) el.textContent = ENGLISH[text];
	});
}

/** A prévia antes de aplicar, com o resultado já pronto. */
async function preview(target: HTMLElement, spec: { title: string; before: string; after: string }) {
	let done!: () => void;
	const ready = new Promise<void>((resolve) => (done = resolve));
	const modal = new PreviewModal(app, {
		title: spec.title,
		original: spec.before,
		run: async () => {
			window.setTimeout(done, 0);
			return spec.after;
		},
		apply: () => true,
	});
	modal.open();
	const el = place(target, modal.containerEl);
	translate(el);
	await ready;
	// A altura da caixa é ajustada depois que a janela já está na imagem.
	(modal as any).fitResult();
	return el;
}

/** Separa o que a IA vê do que fica intocado (links, código, tags...). */
function segments(text: string): { text?: string; markup?: string }[] {
	return toSegments(text) as { text?: string; markup?: string }[];
}

(window as any).Promo = { preview, segments };
