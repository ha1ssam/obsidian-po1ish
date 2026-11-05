// Substitutos mínimos da API do Obsidian, só para desenhar as janelas do plugin fora do app.

// ---------- Ajudantes de DOM do Obsidian ----------
type Info = { cls?: string | string[]; text?: string; type?: string; placeholder?: string; attr?: Record<string, string | number | boolean> } | string;
const P = HTMLElement.prototype as any;
function apply(el: HTMLElement, o?: Info) {
	if (!o) return;
	if (typeof o === "string") { el.className = o; return; }
	if (o.cls) el.classList.add(...([] as string[]).concat(o.cls).flatMap((c) => c.split(" ")).filter(Boolean));
	if (o.text != null) el.textContent = o.text;
	if (o.type) el.setAttribute("type", o.type);
	if (o.placeholder) el.setAttribute("placeholder", o.placeholder);
	if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, String(v));
}
P.createEl = function (tag: string, o?: Info, cb?: (el: HTMLElement) => void) {
	const el = this.ownerDocument.createElement(tag); apply(el, o); this.appendChild(el); cb?.(el); return el;
};
P.createDiv = function (o?: Info, cb?: any) { return this.createEl("div", o, cb); };
P.createSpan = function (o?: Info, cb?: any) { return this.createEl("span", o, cb); };
P.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
P.setText = function (t: string) { this.textContent = t; };
P.addClass = function (...c: string[]) { this.classList.add(...c); };
P.removeClass = function (...c: string[]) { this.classList.remove(...c); };
P.toggleClass = function (c: string, v: boolean) { this.classList.toggle(c, v); };
P.setCssStyles = function (s: Record<string, string>) { Object.assign(this.style, s); };

// ---------- Componentes ----------
export class App {}
export class Notice { constructor(_text: string) {} }
export const Platform = { isMacOS: false, isMobile: false, isDesktop: true };
export async function requestUrl(): Promise<never> { throw new Error("Sem rede nas imagens."); }
export type RequestUrlResponse = unknown;

export class Modal {
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	scope = { register() {} };
	constructor(public app: App) {
		this.containerEl = document.createElement("div");
		this.containerEl.className = "modal-container";
		this.modalEl = (this.containerEl as any).createDiv({ cls: "modal" });
		(this.modalEl as any).createDiv({ cls: "modal-close-button" });
		this.titleEl = (this.modalEl as any).createDiv({ cls: "modal-header" }).createDiv({ cls: "modal-title" });
		this.contentEl = (this.modalEl as any).createDiv({ cls: "modal-content" });
	}
	setTitle(title: string): this { this.titleEl.textContent = title; return this; }
	open(): void { document.body.appendChild(this.containerEl); this.onOpen(); }
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
	setPlaceholder(_text: string): void {}
	declare _item?: T;
}

export class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(parent: HTMLElement) { this.buttonEl = (parent as any).createEl("button"); }
	setButtonText(text: string): this { this.buttonEl.textContent = text; return this; }
	setCta(): this { this.buttonEl.classList.add("mod-cta"); return this; }
	setDisabled(disabled: boolean): this { this.buttonEl.disabled = disabled; return this; }
	onClick(_cb: () => void): this { return this; }
}

export class TextAreaComponent {
	inputEl: HTMLTextAreaElement;
	constructor(parent: HTMLElement) { this.inputEl = (parent as any).createEl("textarea"); }
	setValue(value: string): this { this.inputEl.value = value; return this; }
	getValue(): string { return this.inputEl.value; }
	setPlaceholder(text: string): this { this.inputEl.placeholder = text; return this; }
	setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return this; }
	onChange(_cb: (value: string) => void): this { return this; }
}
