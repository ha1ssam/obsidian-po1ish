import { Editor, Notice, Platform, Plugin } from "obsidian";
import { improveWithAi } from "./ai";
import { FriendlyError } from "./http";
import { improveText } from "./languagetool";
import { MAX_CHARS } from "./prompt";
import { DEFAULT_SETTINGS, PolishSettingTab, PolishSettings } from "./settings";

type Mode = "spelling" | "ai";

const UNDO = Platform.isMacOS ? "Cmd+Z" : "Ctrl+Z";

export default class PolishPlugin extends Plugin {
	settings: PolishSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		this.addSettingTab(new PolishSettingTab(this.app, this));

		// Opções no menu de clique direito, só quando há texto selecionado.
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (!editor.somethingSelected()) return;
				menu.addItem((item) =>
					item
						.setTitle("Melhorar desc")
						.setIcon("spell-check")
						.setSection("selection")
						.onClick(() => void this.improveSelection(editor, "spelling"))
				);
				menu.addItem((item) =>
					item
						.setTitle("Melhorar desc com IA")
						.setIcon("sparkles")
						.setSection("selection")
						.onClick(() => void this.improveSelection(editor, "ai"))
				);
			})
		);

		// Mesmo efeito pela paleta de comandos, para quem quiser um atalho de teclado.
		this.addCommand({
			id: "improve-selection",
			name: "Melhorar texto selecionado",
			icon: "spell-check",
			editorCheckCallback: (checking, editor) => this.runCommand(checking, editor, "spelling"),
		});
		this.addCommand({
			id: "improve-selection-ai",
			name: "Melhorar texto selecionado com IA",
			icon: "sparkles",
			editorCheckCallback: (checking, editor) => this.runCommand(checking, editor, "ai"),
		});
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

	private runCommand(checking: boolean, editor: Editor, mode: Mode): boolean {
		if (!editor.somethingSelected()) return false;
		if (!checking) void this.improveSelection(editor, mode);
		return true;
	}

	async improveSelection(editor: Editor, mode: Mode): Promise<void> {
		const from = editor.getCursor("from");
		const to = editor.getCursor("to");
		const original = editor.getRange(from, to);
		if (!original.trim()) return;
		if (original.length > MAX_CHARS) {
			new Notice("Seleção grande demais. Selecione até 20 mil caracteres por vez.");
			return;
		}

		const working = new Notice(mode === "ai" ? "Melhorando o texto com IA…" : "Melhorando o texto…", 0);
		try {
			let text: string;
			let message: string;
			if (mode === "ai") {
				text = await improveWithAi(original, {
					engine: this.settings.aiEngine,
					geminiKey: this.geminiKey(),
					geminiModel: this.settings.geminiModel,
					ollamaUrl: this.settings.ollamaUrl,
					ollamaModel: this.settings.ollamaModel,
				});
				message = `Texto melhorado com IA. ${UNDO} desfaz.`;
			} else {
				const result = await improveText(original, this.settings.language, this.settings.server);
				text = result.text;
				const n = result.fixes;
				message = `${n} ${n === 1 ? "correção aplicada" : "correções aplicadas"}. ${UNDO} desfaz.`;
			}
			if (text === original) {
				new Notice("Nada para melhorar.");
				return;
			}
			// A nota pode ter mudado enquanto esperava a resposta.
			if (editor.getRange(from, to) !== original) {
				new Notice("O texto mudou durante a correção. Selecione e tente de novo.");
				return;
			}
			editor.replaceRange(text, from, to);
			editor.setSelection(from, editor.offsetToPos(editor.posToOffset(from) + text.length));
			new Notice(message);
		} catch (error) {
			if (error instanceof FriendlyError) {
				new Notice(error.message, 8000);
			} else {
				new Notice("Erro ao melhorar o texto.");
				console.error("Po1ish:", error);
			}
		} finally {
			working.hide();
		}
	}
}
