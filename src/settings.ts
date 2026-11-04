import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import {
	AiEngine,
	DEFAULT_GEMINI_MODEL,
	DEFAULT_OLLAMA_URL,
	listGeminiModels,
	listOllamaModels,
} from "./ai";
import type PolishPlugin from "./main";

export interface PolishSettings {
	language: string;
	server: string;
	aiEngine: AiEngine;
	/** Nome do segredo no Keychain do Obsidian, não a chave em si. */
	geminiSecret: string;
	geminiModel: string;
	ollamaUrl: string;
	ollamaModel: string;
}

export const DEFAULT_SERVER = "https://api.languagetool.org";

export const DEFAULT_SETTINGS: PolishSettings = {
	language: "pt-BR",
	server: DEFAULT_SERVER,
	aiEngine: "server",
	geminiSecret: "",
	geminiModel: DEFAULT_GEMINI_MODEL,
	ollamaUrl: DEFAULT_OLLAMA_URL,
	ollamaModel: "",
};

const LANGUAGES: Record<string, string> = {
	"pt-BR": "Português (Brasil)",
	"pt-PT": "Português (Portugal)",
	"en-US": "English (US)",
	"es": "Español",
	"auto": "Detectar automaticamente",
};

const ENGINES: Record<AiEngine, string> = {
	server: "Padrão do plugin (grátis, sem configurar)",
	gemini: "Minha chave do Google Gemini",
	ollama: "Ollama (roda no seu computador)",
};

export class PolishSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: PolishPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Correção ortográfica")
			.setDesc("Usada pela opção “Melhorar desc”, com o LanguageTool.")
			.setHeading();

		new Setting(containerEl)
			.setName("Idioma")
			.setDesc("Idioma usado para corrigir o texto selecionado.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(LANGUAGES)
					.setValue(settings.language)
					.onChange((language) => void this.plugin.updateSettings({ language }))
			);

		new Setting(containerEl)
			.setName("Servidor do LanguageTool")
			.setDesc(
				"O servidor público é gratuito, com limite de 20 pedidos por minuto. Troque só se tiver o seu próprio servidor."
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SERVER)
					.setValue(settings.server === DEFAULT_SERVER ? "" : settings.server)
					.onChange((value) => void this.plugin.updateSettings({ server: value.trim() || DEFAULT_SERVER }))
			);

		new Setting(containerEl)
			.setName("Inteligência artificial")
			.setDesc(
				"Usada pela opção “Melhorar desc com IA”, que corrige e também deixa o texto mais claro, sem mudar o sentido."
			)
			.setHeading();

		const engineDesc =
			settings.aiEngine === "server"
				? "Funciona sem chave: o texto passa pelo servidor do plugin e é revisado pelo Google Gemini. O limite diário é dividido entre todos que usam o plugin, e o Google pode usar o texto para melhorar os modelos dele."
				: "";
		new Setting(containerEl)
			.setName("Motor")
			.setDesc(engineDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(ENGINES)
					.setValue(settings.aiEngine)
					.onChange(async (value) => {
						await this.plugin.updateSettings({ aiEngine: value as AiEngine });
						this.display();
					})
			);

		if (settings.aiEngine === "gemini") this.displayGemini(containerEl);
		else if (settings.aiEngine === "ollama") this.displayOllama(containerEl);
	}

	private displayGemini(containerEl: HTMLElement): void {
		const settings = this.plugin.settings;
		const keyDesc = createFragment((frag) => {
			frag.appendText("Crie uma chave grátis em ");
			frag.createEl("a", { text: "aistudio.google.com/apikey", href: "https://aistudio.google.com/apikey" });
			frag.appendText(
				". Ela fica guardada no Keychain do Obsidian, fora das suas notas. No plano gratuito, o Google pode usar o texto enviado para melhorar os modelos dele."
			);
		});
		new Setting(containerEl)
			.setName("Chave do Gemini")
			.setDesc(keyDesc)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(settings.geminiSecret)
					.onChange((value) => void this.plugin.updateSettings({ geminiSecret: value ?? "" }))
			);

		const modelSetting = new Setting(containerEl)
			.setName("Modelo do Gemini")
			.setDesc(`“${DEFAULT_GEMINI_MODEL}” sempre usa o Flash-Lite mais novo: rápido e com plano gratuito.`);
		modelSetting.addDropdown((dropdown) => {
			const options: Record<string, string> = { [DEFAULT_GEMINI_MODEL]: `Flash-Lite mais novo (${DEFAULT_GEMINI_MODEL})` };
			if (settings.geminiModel) options[settings.geminiModel] ??= settings.geminiModel;
			dropdown
				.addOptions(options)
				.setValue(settings.geminiModel || DEFAULT_GEMINI_MODEL)
				.onChange((geminiModel) => void this.plugin.updateSettings({ geminiModel }));

			const key = this.plugin.geminiKey();
			if (!key) return;
			listGeminiModels(key)
				.then((models) => {
					for (const [id, name] of Object.entries(models)) {
						if (!(id in options)) dropdown.addOption(id, name);
					}
				})
				.catch((error: Error) => modelSetting.setDesc(error.message));
		});
	}

	private displayOllama(containerEl: HTMLElement): void {
		const settings = this.plugin.settings;
		const intro = createFragment((frag) => {
			frag.appendText("Instale o Ollama em ");
			frag.createEl("a", { text: "ollama.com", href: "https://ollama.com" });
			frag.appendText(" e baixe um modelo, por exemplo: ollama pull gemma3. Só funciona no computador.");
		});

		new Setting(containerEl)
			.setName("Endereço do Ollama")
			.setDesc(intro)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_OLLAMA_URL)
					.setValue(settings.ollamaUrl === DEFAULT_OLLAMA_URL ? "" : settings.ollamaUrl)
					.onChange((value) => void this.plugin.updateSettings({ ollamaUrl: value.trim() || DEFAULT_OLLAMA_URL }))
			);

		const modelSetting = new Setting(containerEl).setName("Modelo do Ollama").setDesc("Procurando modelos…");
		modelSetting.addDropdown((dropdown) => {
			if (settings.ollamaModel) dropdown.addOption(settings.ollamaModel, settings.ollamaModel);
			dropdown.setValue(settings.ollamaModel).onChange((ollamaModel) => void this.plugin.updateSettings({ ollamaModel }));

			listOllamaModels(settings.ollamaUrl)
				.then(async (models) => {
					for (const model of models) if (model !== settings.ollamaModel) dropdown.addOption(model, model);
					if (!models.length) {
						modelSetting.setDesc("Nenhum modelo baixado. Rode, por exemplo: ollama pull gemma3");
						return;
					}
					modelSetting.setDesc("Modelos já baixados no seu computador.");
					if (!settings.ollamaModel) {
						dropdown.setValue(models[0]);
						await this.plugin.updateSettings({ ollamaModel: models[0] });
					}
				})
				.catch((error: Error) => modelSetting.setDesc(error.message));
		});

		modelSetting.addExtraButton((button) =>
			button
				.setIcon("refresh-cw")
				.setTooltip("Procurar de novo")
				.onClick(() => this.display())
		);
	}
}
