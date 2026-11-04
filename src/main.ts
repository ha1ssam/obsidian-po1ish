import { Editor, EditorPosition, Notice, Platform, Plugin } from "obsidian";
import { improveWithAi } from "./ai";
import { FriendlyError } from "./http";
import { improveText } from "./languagetool";
import { PreviewModal, RequestModal, TypePickerModal } from "./modals";
import { MAX_CHARS, TEXT_TYPES, TextType } from "./prompt";
import { DEFAULT_SERVER, DEFAULT_SETTINGS, PolishSettingTab, PolishSettings } from "./settings";

const UNDO = Platform.isMacOS ? "Cmd+Z" : "Ctrl+Z";

/** O que pedir à IA: o tipo de texto e/ou um pedido livre. */
interface AiTask {
	type?: TextType;
	request?: string;
}

/** Trecho selecionado no momento do pedido. */
interface Selection {
	editor: Editor;
	from: EditorPosition;
	to: EditorPosition;
	original: string;
}

export default class PolishPlugin extends Plugin {
	settings: PolishSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		const saved = (await this.loadData()) as Partial<PolishSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
		this.addSettingTab(new PolishSettingTab(this.app, this));

		// Opções no menu de clique direito, só quando há texto selecionado.
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (!editor.somethingSelected()) return;
				menu.addItem((item) =>
					item
						.setTitle("Corrigir ortografia")
						.setIcon("spell-check")
						.setSection("selection")
						.onClick(() => void this.fixSpelling(editor))
				);
				menu.addItem((item) =>
					item
						.setTitle("Polir texto com IA")
						.setIcon("sparkles")
						.setSection("selection")
						.onClick(() => this.improveWithAi(editor, {}))
				);
				menu.addItem((item) =>
					item
						.setTitle("Polir texto como…")
						.setIcon("list")
						.setSection("selection")
						.onClick(() => this.pickType(editor))
				);
				menu.addItem((item) =>
					item
						.setTitle("Polir com instrução…")
						.setIcon("message-square")
						.setSection("selection")
						.onClick(() => this.askAi(editor))
				);
			})
		);

		// Mesmos comandos na paleta, para quem quiser atalhos de teclado.
		this.addEditorCommand("improve-selection", "Corrigir ortografia da seleção", "spell-check", (editor) =>
			void this.fixSpelling(editor)
		);
		this.addEditorCommand("improve-selection-ai", "Polir seleção com IA", "sparkles", (editor) =>
			this.improveWithAi(editor, {})
		);
		this.addEditorCommand("improve-selection-as", "Polir seleção como…", "list", (editor) =>
			this.pickType(editor)
		);
		this.addEditorCommand("ask-ai", "Polir seleção com instrução…", "message-square", (editor) =>
			this.askAi(editor)
		);
	}

	async updateSettings(patch: Partial<PolishSettings>): Promise<void> {
		this.settings = { ...this.settings, ...patch };
		await this.saveData(this.settings);
	}

	/** A chave do Gemini fica no Keychain do Obsidian; as configurações guardam só o nome dela. */
	geminiKey(): string | null {
		const id = this.settings.geminiSecret;
		return id ? this.app.secretStorage.getSecret(id) : null;
	}

	/** Comando que só aparece quando há texto selecionado. */
	private addEditorCommand(id: string, name: string, icon: string, run: (editor: Editor) => void): void {
		this.addCommand({
			id,
			name,
			icon,
			editorCheckCallback: (checking, editor) => {
				if (!editor.somethingSelected()) return false;
				if (!checking) run(editor);
				return true;
			},
		});
	}

	/** Lê a seleção atual, ou avisa e devolve null se não der para usar. */
	private readSelection(editor: Editor): Selection | null {
		const from = editor.getCursor("from");
		const to = editor.getCursor("to");
		const original = editor.getRange(from, to);
		if (!original.trim()) return null;
		if (original.length > MAX_CHARS) {
			new Notice("Seleção grande demais. Selecione até 20 mil caracteres por vez.");
			return null;
		}
		return { editor, from, to, original };
	}

	/** Troca o trecho pelo texto novo, se a nota não mudou enquanto esperava. */
	private replace(selection: Selection, text: string): boolean {
		const { editor, from, to, original } = selection;
		if (editor.getRange(from, to) !== original) {
			new Notice("O texto mudou enquanto a IA trabalhava. Selecione e tente de novo.");
			return false;
		}
		editor.replaceRange(text, from, to);
		editor.setSelection(from, editor.offsetToPos(editor.posToOffset(from) + text.length));
		return true;
	}

	private showError(error: unknown): void {
		if (error instanceof FriendlyError) {
			new Notice(error.message, 8000);
		} else {
			new Notice("Erro ao polir o texto.");
			console.error("Po1ish:", error);
		}
	}

	/** "Corrigir ortografia": só ortografia, com o LanguageTool, aplicada direto. */
	async fixSpelling(editor: Editor): Promise<void> {
		const selection = this.readSelection(editor);
		if (!selection) return;
		const working = new Notice("Corrigindo a ortografia…", 0);
		try {
			const { text, fixes } = await improveText(
				selection.original,
				this.settings.language,
				this.settings.server || DEFAULT_SERVER
			);
			if (fixes === 0 || text === selection.original) {
				new Notice("Nada para corrigir.");
				return;
			}
			if (this.replace(selection, text)) {
				new Notice(`${fixes} ${fixes === 1 ? "correção aplicada" : "correções aplicadas"}. ${UNDO} desfaz.`);
			}
		} catch (error) {
			this.showError(error);
		} finally {
			working.hide();
		}
	}

	private pickType(editor: Editor): void {
		new TypePickerModal(this.app, (type) => this.improveWithAi(editor, { type })).open();
	}

	private askAi(editor: Editor): void {
		if (!this.readSelection(editor)) return;
		new RequestModal(this.app, (request) => this.improveWithAi(editor, { request })).open();
	}

	private runAi(original: string, task: AiTask): Promise<string> {
		return improveWithAi(original, {
			engine: this.settings.aiEngine,
			geminiKey: this.geminiKey(),
			geminiModel: this.settings.geminiModel,
			ollamaUrl: this.settings.ollamaUrl,
			ollamaModel: this.settings.ollamaModel,
			customPrompt: this.settings.customPrompt,
			type: task.type,
			request: task.request,
		});
	}

	/** Melhora com IA: mostra a prévia ou aplica direto, conforme as configurações. */
	improveWithAi(editor: Editor, task: AiTask): void {
		const selection = this.readSelection(editor);
		if (!selection) return;

		if (this.settings.preview) {
			const title = task.request
				? `Instrução: ${task.request}`
				: task.type && task.type !== "auto"
					? `Polir como: ${TEXT_TYPES[task.type]}`
					: "Polir texto com IA";
			new PreviewModal(this.app, {
				title,
				original: selection.original,
				run: () => this.runAi(selection.original, task),
				apply: (text) => this.replace(selection, text),
			}).open();
			return;
		}

		void this.applyDirectly(selection, task);
	}

	private async applyDirectly(selection: Selection, task: AiTask): Promise<void> {
		const working = new Notice("Polindo o texto com IA…", 0);
		try {
			const text = await this.runAi(selection.original, task);
			if (text === selection.original) {
				new Notice("Nada para polir.");
				return;
			}
			if (this.replace(selection, text)) new Notice(`Texto polido com IA. ${UNDO} desfaz.`);
		} catch (error) {
			this.showError(error);
		} finally {
			working.hide();
		}
	}
}
