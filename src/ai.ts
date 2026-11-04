import { RequestUrlResponse } from "obsidian";
import { FriendlyError, request } from "./http";
import { toSegments } from "./languagetool";
import { PROMPT } from "./prompt";

/** server = servidor do plugin (chave do autor), gemini = chave própria, ollama = local. */
export type AiEngine = "server" | "gemini" | "ollama";

export const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
/** Atalho do Google para o Flash-Lite mais novo: rápido e com plano gratuito. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
/** Worker na Cloudflare que guarda a chave do Gemini do autor (pasta worker/). */
export const SERVER_URL = "https://melhorar-desc.melhorar-desc-worker.workers.dev";

const PLACEHOLDER = /⟦(\d+)⟧/g;
const BLOCK_MARKER = /^(?:```|[ \t]*(?:[-*+]|\d+[.)]|#{1,6}|>)(?:[ \t]|$))/;

/**
 * Troca links, código e formatação por ⟦n⟧ antes de mandar para a IA,
 * para ela não conseguir alterá-los.
 */
function protect(text: string): { masked: string; pieces: string[]; lineStart: Set<number> } {
	const pieces: string[] = [];
	const lineStart = new Set<number>();
	let masked = "";
	for (const segment of toSegments(text)) {
		if ("text" in segment) {
			masked += segment.text;
			continue;
		}
		// Marcadores de bloco (lista, título, citação, ```) precisam continuar no começo da linha.
		if ((masked === "" || masked.endsWith("\n")) && BLOCK_MARKER.test(segment.markup)) {
			lineStart.add(pieces.length);
		}
		masked += `⟦${pieces.length}⟧`;
		pieces.push(segment.markup);
	}
	return { masked, pieces, lineStart };
}

/** Devolve os trechos originais no lugar dos ⟦n⟧, ou null se a IA mexeu neles. */
function restore(answer: string, pieces: string[], lineStart: Set<number>): string | null {
	const found: number[] = [];
	let match: RegExpExecArray | null;
	PLACEHOLDER.lastIndex = 0;
	while ((match = PLACEHOLDER.exec(answer))) {
		const index = Number(match[1]);
		found.push(index);
		if (lineStart.has(index) && match.index > 0 && answer[match.index - 1] !== "\n") return null;
	}
	if (found.length !== pieces.length || found.some((index, i) => index !== i)) return null;
	return answer.replace(PLACEHOLDER, (_, index: string) => pieces[Number(index)]);
}

/** Tira o que modelos costumam acrescentar: raciocínio, bloco de código em volta, aspas. */
function cleanAnswer(answer: string): string {
	let text = answer.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
	const fenced = text.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
	if (fenced) text = fenced[1];
	return text;
}

/** O Ollama ganha mais tempo, porque carregar o modelo na primeira vez demora. */
const OLLAMA_TIMEOUT_MS = 180000;
const AI_TIMEOUT = "A IA demorou demais para responder. Tente de novo em alguns minutos.";

function geminiError(response: RequestUrlResponse | null): FriendlyError {
	if (!response) return new FriendlyError("Não foi possível falar com o Gemini. Verifique a internet.");
	const message: string = response.json?.error?.message ?? "";
	if (response.status === 429) return new FriendlyError("Limite gratuito do Gemini atingido. Espere um pouco e tente de novo.");
	if (/API key/i.test(message) || response.status === 401 || response.status === 403) {
		return new FriendlyError("Chave do Gemini inválida. Confira nas configurações do plugin.");
	}
	if (response.status === 404) return new FriendlyError("Modelo do Gemini não encontrado. Escolha outro nas configurações.");
	return new FriendlyError(`O Gemini respondeu com erro ${response.status}${message ? `: ${message}` : "."}`);
}

async function askGemini(text: string, key: string, model: string): Promise<string> {
	const response = await request(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
		method: "POST",
		timeoutMessage: AI_TIMEOUT,
		headers: { "x-goog-api-key": key },
		body: {
			systemInstruction: { parts: [{ text: PROMPT }] },
			contents: [{ role: "user", parts: [{ text }] }],
			generationConfig: { temperature: 0.2 },
		},
	});
	if (response?.status !== 200) throw geminiError(response);
	const parts: { text?: string; thought?: boolean }[] = response.json?.candidates?.[0]?.content?.parts ?? [];
	const answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
	if (!answer.trim()) throw new FriendlyError("O Gemini não devolveu texto (pode ter sido bloqueado pelos filtros).");
	return answer;
}

async function askServer(text: string, url: string): Promise<string> {
	const response = await request(`${url.replace(/\/+$/, "")}/improve`, { method: "POST", timeoutMessage: AI_TIMEOUT, body: { text } });
	if (!response) throw new FriendlyError("Não foi possível falar com o servidor do plugin. Verifique a internet.");
	if (response.status !== 200) {
		const message: string | undefined = response.json?.error;
		throw new FriendlyError(message ?? `O servidor do plugin respondeu com erro ${response.status}.`);
	}
	return response.json?.text ?? "";
}

async function askOllama(text: string, url: string, model: string): Promise<string> {
	if (!model) throw new FriendlyError("Escolha um modelo do Ollama nas configurações do plugin.");
	const response = await request(`${url.replace(/\/+$/, "")}/api/chat`, {
		method: "POST",
		timeoutMs: OLLAMA_TIMEOUT_MS,
		timeoutMessage: AI_TIMEOUT,
		body: {
			model,
			stream: false,
			messages: [
				{ role: "system", content: PROMPT },
				{ role: "user", content: text },
			],
			options: { temperature: 0.2 },
		},
	});
	if (!response) throw new FriendlyError("O Ollama não está rodando. Abra o Ollama e tente de novo.");
	if (response.status === 404) throw new FriendlyError(`Modelo "${model}" não encontrado no Ollama.`);
	if (response.status !== 200) throw new FriendlyError(`O Ollama respondeu com erro ${response.status}.`);
	return response.json?.message?.content ?? "";
}

export interface AiOptions {
	engine: AiEngine;
	/** Só para testes: troca o endereço do servidor do plugin. */
	serverUrl?: string;
	geminiKey: string | null;
	geminiModel: string;
	ollamaUrl: string;
	ollamaModel: string;
}

/** Revisa `text` com a IA escolhida, mantendo intactos links, código e formatação. */
export async function improveWithAi(text: string, options: AiOptions): Promise<string> {
	if (text.includes("⟦")) throw new FriendlyError("O texto tem o caractere ⟦, que o plugin usa internamente. Remova-o e tente de novo.");
	const { masked, pieces, lineStart } = protect(text);
	let answer: string;
	if (options.engine === "server") {
		answer = await askServer(masked, options.serverUrl || SERVER_URL);
	} else if (options.engine === "gemini") {
		if (!options.geminiKey) throw new FriendlyError("Coloque a sua chave do Gemini nas configurações do plugin.");
		answer = await askGemini(masked, options.geminiKey, options.geminiModel || DEFAULT_GEMINI_MODEL);
	} else {
		answer = await askOllama(masked, options.ollamaUrl || DEFAULT_OLLAMA_URL, options.ollamaModel);
	}
	const restored = restore(cleanAnswer(answer), pieces, lineStart);
	if (restored === null) {
		throw new FriendlyError("A IA alterou links ou formatação, então nada foi mudado. Tente de novo.");
	}
	// Mantém os espaços e quebras de linha das pontas da seleção.
	const lead = text.match(/^\s*/)?.[0] ?? "";
	const trail = text.match(/\s*$/)?.[0] ?? "";
	return lead + restored.trim() + trail;
}

/** Modelos do Gemini que geram texto, para escolher nas configurações. */
export async function listGeminiModels(key: string): Promise<Record<string, string>> {
	const response = await request(`${GEMINI_API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
	if (response?.status !== 200) throw geminiError(response);
	const models: Record<string, string> = {};
	for (const model of response.json?.models ?? []) {
		const id = String(model.name).replace(/^models\//, "");
		if (!id.startsWith("gemini") || !model.supportedGenerationMethods?.includes("generateContent")) continue;
		if (/tts|image|audio|live|embedding/i.test(id)) continue;
		models[id] = model.displayName ? `${model.displayName} (${id})` : id;
	}
	return models;
}

/** Modelos baixados no Ollama. */
export async function listOllamaModels(url: string): Promise<string[]> {
	const response = await request(`${url.replace(/\/+$/, "")}/api/tags`, {});
	if (!response) throw new FriendlyError("O Ollama não está rodando neste endereço.");
	if (response.status !== 200) throw new FriendlyError(`O Ollama respondeu com erro ${response.status}.`);
	return (response.json?.models ?? []).map((model: { name: string }) => model.name);
}
