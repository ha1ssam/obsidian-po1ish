// Expõe as janelas reais do plugin e os dados que as imagens de divulgação usam.
import { App } from "obsidian";
import { toSegments } from "../src/languagetool";
import { PreviewModal, RequestModal } from "../src/modals";
import { MAX_REQUEST_CHARS, TEXT_TYPES } from "../src/prompt";

const app = new App();

/** Tira a janela do fundo escuro do Obsidian e põe dentro da imagem. */
function place(target: HTMLElement, container: HTMLElement): HTMLElement {
	const modal = container.querySelector<HTMLElement>(".modal")!;
	target.appendChild(modal);
	container.remove();
	(document.activeElement as HTMLElement | null)?.blur();
	return modal;
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
	await ready;
	// A altura da caixa é ajustada depois que a janela já está na imagem.
	(modal as any).fitResult();
	return el;
}

/** A caixa de "Polir com instrução…", já preenchida. */
function request(target: HTMLElement, text: string) {
	const modal = new RequestModal(app, () => {});
	modal.open();
	const el = place(target, modal.containerEl);
	el.querySelector("textarea")!.value = text;
	el.querySelector(".po1ish-counter")!.textContent = `${text.length}/${MAX_REQUEST_CHARS}`;
	return el;
}

/** Separa o que a IA vê do que fica intocado (links, código, tags...). */
function segments(text: string): { text?: string; markup?: string }[] {
	return toSegments(text) as { text?: string; markup?: string }[];
}

(window as any).Promo = { preview, request, segments, types: TEXT_TYPES };
