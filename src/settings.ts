import { App, DropdownComponent, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
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

const isEngine = (value: unknown): value is AiEngine =>
	typeof value === "string" && Object.prototype.hasOwnProperty.call(ENGINES, value);

const link = (before: string, text: string, href: string, after: string) =>
	createFragment((frag) => {
		frag.appendText(before);
		frag.createEl("a", { text, href });
		frag.appendText(after);
	});

export class PolishSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: PolishPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const engine = () => this.plugin.settings.aiEngine;
		return [
			{
				type: "group",
				heading: "Correção ortográfica",
				items: [
					{
						name: "Idioma",
						desc: "Idioma usado pela opção “Melhorar desc”, que corrige com o LanguageTool.",
						control: { type: "dropdown", key: "language", options: LANGUAGES },
					},
					{
						name: "Servidor do LanguageTool",
						desc: "O servidor público é gratuito, com limite de 20 pedidos por minuto. Troque só se tiver o seu próprio servidor.",
						control: { type: "text", key: "server", placeholder: DEFAULT_SERVER },
					},
				],
			},
			{
				type: "group",
				heading: "Inteligência artificial",
				items: [
					{
						name: "Motor",
						desc: "Usado pela opção “Melhorar desc com IA”, que corrige e também deixa o texto mais claro, sem mudar o sentido.",
						aliases: ["IA", "AI", "Gemini", "Ollama"],
						control: { type: "dropdown", key: "aiEngine", options: ENGINES },
					},
					{
						name: "Como funciona o padrão",
						desc: "Funciona sem chave: o texto passa pelo servidor do plugin e é revisado pelo Google Gemini. O limite diário é dividido entre todos que usam o plugin, e o Google pode usar o texto para melhorar os modelos dele.",
						searchable: false,
						visible: () => engine() === "server",
					},
					{
						name: "Chave do Gemini",
						desc: link(
							"Crie uma chave grátis em ",
							"aistudio.google.com/apikey",
							"https://aistudio.google.com/apikey",
							". Ela fica guardada no Keychain do Obsidian, fora das suas notas. No plano gratuito, o Google pode usar o texto enviado para melhorar os modelos dele."
						),
						visible: () => engine() === "gemini",
						control: { type: "secret", key: "geminiSecret" },
					},
					{
						name: "Modelo do Gemini",
						visible: () => engine() === "gemini",
						render: (setting) => this.renderGeminiModel(setting),
					},
					{
						name: "Endereço do Ollama",
						desc: link(
							"Instale o Ollama em ",
							"ollama.com",
							"https://ollama.com",
							" e baixe um modelo, por exemplo: ollama pull gemma3. Só funciona no computador."
						),
						visible: () => engine() === "ollama",
						control: { type: "text", key: "ollamaUrl", placeholder: DEFAULT_OLLAMA_URL },
					},
					{
						name: "Modelo do Ollama",
						visible: () => engine() === "ollama",
						render: (setting) => this.renderOllamaModel(setting),
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const text = typeof value === "string" ? value.trim() : "";
		if (key === "language") await this.plugin.updateSettings({ language: text || DEFAULT_SETTINGS.language });
		else if (key === "server") await this.plugin.updateSettings({ server: text || DEFAULT_SERVER });
		else if (key === "aiEngine" && isEngine(value)) await this.plugin.updateSettings({ aiEngine: value });
		else if (key === "geminiSecret") await this.plugin.updateSettings({ geminiSecret: text });
		else if (key === "ollamaUrl") await this.plugin.updateSettings({ ollamaUrl: text || DEFAULT_OLLAMA_URL });
		// O motor escolhido decide quais opções aparecem.
		this.refreshDomState();
	}

	/** Lista os modelos que a chave da pessoa pode usar. */
	private renderGeminiModel(setting: Setting): void {
		const settings = this.plugin.settings;
		setting
			.setName("Modelo do Gemini")
			.setDesc(`“${DEFAULT_GEMINI_MODEL}” sempre usa o Flash-Lite mais novo: rápido e com plano gratuito.`);
		setting.addDropdown((dropdown) => {
			const options: Record<string, string> = {
				[DEFAULT_GEMINI_MODEL]: `Flash-Lite mais novo (${DEFAULT_GEMINI_MODEL})`,
			};
			if (settings.geminiModel && !(settings.geminiModel in options)) options[settings.geminiModel] = settings.geminiModel;
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
				.catch((error: Error) => setting.setDesc(error.message));
		});
	}

	/** Lista os modelos já baixados no Ollama. */
	private renderOllamaModel(setting: Setting): void {
		setting.setName("Modelo do Ollama").setDesc("Procurando modelos…");
		let dropdown: DropdownComponent | null = null;
		setting.addDropdown((component) => {
			dropdown = component;
			component.onChange((ollamaModel) => void this.plugin.updateSettings({ ollamaModel }));
		});
		setting.addExtraButton((button) =>
			button
				.setIcon("refresh-cw")
				.setTooltip("Procurar de novo")
				.onClick(() => {
					if (dropdown) void this.loadOllamaModels(setting, dropdown);
				})
		);
		if (dropdown) void this.loadOllamaModels(setting, dropdown);
	}

	private async loadOllamaModels(setting: Setting, dropdown: DropdownComponent): Promise<void> {
		const settings = this.plugin.settings;
		dropdown.selectEl.empty();
		try {
			const models = await listOllamaModels(settings.ollamaUrl || DEFAULT_OLLAMA_URL);
			if (settings.ollamaModel && !models.includes(settings.ollamaModel)) models.unshift(settings.ollamaModel);
			for (const model of models) dropdown.addOption(model, model);
			if (!models.length) {
				setting.setDesc("Nenhum modelo baixado. Rode, por exemplo: ollama pull gemma3");
				return;
			}
			setting.setDesc("Modelos já baixados no seu computador.");
			if (!settings.ollamaModel) await this.plugin.updateSettings({ ollamaModel: models[0] });
			dropdown.setValue(this.plugin.settings.ollamaModel);
		} catch (error) {
			setting.setDesc(error instanceof Error ? error.message : "Não foi possível falar com o Ollama.");
		}
	}
}
