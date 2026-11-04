import { App, ButtonComponent, FuzzySuggestModal, Modal, Notice, Platform, TextAreaComponent } from "obsidian";
import { FriendlyError } from "./http";
import { MAX_REQUEST_CHARS, TEXT_TYPES, TextType } from "./prompt";

/** Lista de tipos de texto, com busca, para "Polir texto como…". */
export class TypePickerModal extends FuzzySuggestModal<TextType> {
	constructor(app: App, private onPick: (type: TextType) => void) {
		super(app);
		this.setPlaceholder("Polir texto como…");
	}

	getItems(): TextType[] {
		return Object.keys(TEXT_TYPES) as TextType[];
	}

	getItemText(type: TextType): string {
		return TEXT_TYPES[type];
	}

	onChooseItem(type: TextType): void {
		this.onPick(type);
	}
}

/** Caixa onde a pessoa escreve o que quer da IA, como "deixe mais formal". */
export class RequestModal extends Modal {
	constructor(app: App, private onSubmit: (request: string) => void) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Polir com instrução");
		const { contentEl } = this;
		contentEl.addClass("po1ish-modal");
		contentEl.createEl("p", {
			cls: "po1ish-hint",
			text: "Diga o que fazer com o texto selecionado. Exemplos: deixe mais formal, resuma em uma frase, transforme em lista.",
		});

		const textarea = new TextAreaComponent(contentEl);
		textarea.inputEl.addClass("po1ish-request");
		textarea.inputEl.maxLength = MAX_REQUEST_CHARS;
		textarea.inputEl.rows = 3;
		textarea.setPlaceholder("Por exemplo: deixe mais formal");
		const counter = contentEl.createDiv({ cls: "po1ish-counter" });

		const submit = () => {
			const value = textarea.getValue().trim();
			if (!value) return;
			this.close();
			this.onSubmit(value);
		};
		const updateCounter = () => counter.setText(`${textarea.getValue().length}/${MAX_REQUEST_CHARS}`);
		textarea.onChange(updateCounter);
		updateCounter();
		textarea.inputEl.addEventListener("keydown", (event) => {
			// Enter envia; Shift+Enter quebra linha.
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				submit();
			}
		});

		const buttons = contentEl.createDiv({ cls: "po1ish-buttons" });
		new ButtonComponent(buttons).setButtonText("Cancelar").onClick(() => this.close());
		new ButtonComponent(buttons).setButtonText("Polir").setCta().onClick(submit);
		window.setTimeout(() => textarea.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export interface PreviewOptions {
	title: string;
	original: string;
	/** Pede o texto melhorado (de novo, ao clicar em "Tentar de novo"). */
	run: () => Promise<string>;
	/** Troca o texto na nota. Devolve false se não deu (ex.: a nota mudou). */
	apply: (text: string) => boolean;
}

/** Mostra antes e depois; o resultado pode ser editado antes de aplicar. */
export class PreviewModal extends Modal {
	private result: TextAreaComponent | null = null;
	private status: HTMLElement | null = null;
	private buttons: ButtonComponent[] = [];
	private closed = false;

	constructor(app: App, private options: PreviewOptions) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		const { contentEl } = this;
		contentEl.addClass("po1ish-modal", "po1ish-preview");

		contentEl.createDiv({ cls: "po1ish-label", text: "Antes" });
		contentEl.createDiv({ cls: "po1ish-before", text: this.options.original });

		contentEl.createDiv({ cls: "po1ish-label", text: "Depois (você pode editar)" });
		this.status = contentEl.createDiv({ cls: "po1ish-status" });
		this.result = new TextAreaComponent(contentEl);
		this.result.inputEl.addClass("po1ish-after");

		const buttons = contentEl.createDiv({ cls: "po1ish-buttons" });
		const retry = new ButtonComponent(buttons).setButtonText("Tentar de novo").onClick(() => void this.run());
		const copy = new ButtonComponent(buttons).setButtonText("Copiar").onClick(() => void this.copy());
		const apply = new ButtonComponent(buttons).setButtonText("Aplicar").setCta().onClick(() => this.apply());
		this.buttons = [retry, copy, apply];

		this.scope.register(Platform.isMacOS ? ["Meta"] : ["Ctrl"], "Enter", () => {
			this.apply();
			return false;
		});
		void this.run();
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
	}

	private setBusy(busy: boolean, message = ""): void {
		this.status?.setText(message);
		this.status?.toggleClass("is-error", false);
		this.result?.setDisabled(busy);
		for (const button of this.buttons) button.setDisabled(busy);
	}

	private async run(): Promise<void> {
		this.setBusy(true, "Polindo o texto com IA…");
		this.result?.setValue("");
		try {
			const text = await this.options.run();
			if (this.closed) return;
			this.result?.setValue(text);
			this.setBusy(false, text === this.options.original ? "Nada para polir." : "");
			this.fitResult();
		} catch (error) {
			if (this.closed) return;
			this.setBusy(false);
			this.status?.setText(error instanceof FriendlyError ? error.message : "Erro ao polir o texto.");
			this.status?.toggleClass("is-error", true);
			if (!(error instanceof FriendlyError)) console.error("Po1ish:", error);
		}
	}

	/** Ajusta a altura da caixa ao texto, até um limite. */
	private fitResult(): void {
		const el = this.result?.inputEl;
		if (!el) return;
		el.setCssStyles({ height: "auto" });
		el.setCssStyles({ height: `${Math.min(el.scrollHeight + 4, 360)}px` });
	}

	private async copy(): Promise<void> {
		const text = this.result?.getValue() ?? "";
		if (!text) return;
		await navigator.clipboard.writeText(text);
		new Notice("Texto copiado.");
	}

	private apply(): void {
		const text = this.result?.getValue() ?? "";
		if (!text.trim()) return;
		if (this.options.apply(text)) this.close();
	}
}
