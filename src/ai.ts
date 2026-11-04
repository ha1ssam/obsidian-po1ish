import { RequestUrlResponse } from "obsidian";
import { FriendlyError, readJson, request } from "./http";
import { toSegments } from "./languagetool";
import {
	ATTEMPT_MS,
	DEFAULT_PROMPT,
	GEMINI_MODELS,
	GeminiModel,
	TextType,
	buildPrompt,
	geminiRequestBody,
	skipFor,
} from "./prompt";

/** server = servidor do plugin (chave do autor), gemini = chave própria, ollama = local. */
export type AiEngine = "server" | "gemini" | "ollama";

export const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
/** "auto" tenta os modelos de GEMINI_MODELS em ordem, como o servidor do plugin. */
export const DEFAULT_GEMINI_MODEL = "auto";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
/** Worker na Cloudflare que guarda a chave do Gemini do autor (pasta worker/). */
export const SERVER_URL = "https://melhorar-desc.melhorar-desc-worker.workers.dev";

interface GeminiResponse {
	error: { message?: string };
	candidates: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
	models: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}

interface ServerResponse {
	text: string;
	error: string;
}

interface OllamaResponse {
	message: { content?: string };
	models: { name?: string }[];
}

const PLACEHOLDER = /⟦(\d+)⟧/g;
const BLOCK_MARKER = /^(?:```|[ \t]*(?:[-*+]|\d+[.)]|#{1,6}|>)(?:[ \t]|$))/;

/**
 * Troca links, código e formatação por ⟦n⟧ antes de mandar para a IA,
 * para ela não conseguir alterá-los.
 */
interface Protected {
	masked: string;
	pieces: string[];
	/** Marcadores de bloco: precisam ficar no começo da linha. */
	lineStart: Set<number>;
	/** Links, código, URLs e tags: podem aparecer mais de uma vez. */
	repeatable: Set<number>;
}

function protect(text: string): Protected {
	const pieces: string[] = [];
	const lineStart = new Set<number>();
	const repeatable = new Set<number>();
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
		// "interpretAs" marca o que conta como uma palavra (link, código, URL, tag): repetir não estraga nada.
		if ("interpretAs" in segment) repeatable.add(pieces.length);
		masked += `⟦${pieces.length}⟧`;
		pieces.push(segment.markup);
	}
	return { masked, pieces, lineStart, repeatable };
}

/**
 * Devolve os trechos originais no lugar dos ⟦n⟧, ou null se a IA mexeu neles.
 * Cada marcador precisa aparecer pelo menos uma vez. Formatação (negrito, listas...) só uma vez;
 * links, código e tags podem se repetir. A ordem pode mudar, porque alguns tipos
 * reorganizam as frases (ex.: Problema → Resultado esperado → Ação).
 */
function restore(answer: string, { pieces, lineStart, repeatable }: Protected): string | null {
	const seen = new Set<number>();
	let match: RegExpExecArray | null;
	PLACEHOLDER.lastIndex = 0;
	while ((match = PLACEHOLDER.exec(answer))) {
		const index = Number(match[1]);
		if (index >= pieces.length || (seen.has(index) && !repeatable.has(index))) return null;
		seen.add(index);
		if (lineStart.has(index) && match.index > 0 && answer[match.index - 1] !== "\n") return null;
	}
	if (seen.size !== pieces.length) return null;
	return answer.replace(PLACEHOLDER, (_, index: string) => pieces[Number(index)]);
}

/** Marcador de lista, tarefa, título ou citação no começo de uma linha. */
const LINE_PREFIX = /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?|#{1,6}[ \t]+|>[ \t]?)/;

interface Lines {
	/** Linhas originais (as vazias continuam vazias no resultado). */
	lines: string[];
	/** Marcador de cada linha ("" quando não tem). */
	prefixes: string[];
	/** Quantas linhas têm texto: a IA precisa devolver esse mesmo número. */
	count: number;
	/** Texto sem os marcadores, que vai para a IA. */
	body: string;
}

/**
 * Para listas, títulos e citações: tira o marcador de cada linha antes de mandar para a IA
 * e pede o mesmo número de linhas de volta. Assim ela não junta itens nem perde marcadores.
 */
function splitLines(text: string): Lines | null {
	if (text.includes("```")) return null;
	const lines = text.split("\n");
	const prefixes = lines.map((line) => LINE_PREFIX.exec(line)?.[0] ?? "");
	if (!prefixes.some(Boolean)) return null;
	const bodies = lines.map((line, i) => line.slice(prefixes[i].length));
	return {
		lines,
		prefixes,
		count: bodies.filter((body) => body.trim()).length,
		body: bodies.filter((body) => body.trim()).join("\n"),
	};
}

/** Recoloca cada marcador na sua linha, ou null se a IA mudou o número de linhas. */
function joinLines(answer: string, { lines, prefixes, count }: Lines): string | null {
	const answered = answer.split("\n").filter((line) => line.trim());
	if (answered.length !== count) return null;
	let next = 0;
	return lines
		.map((line, i) => (line.slice(prefixes[i].length).trim() ? prefixes[i] + answered[next++].trim() : line))
		.join("\n");
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

/** Erro da chave: não adianta tentar outro modelo. */
class KeyError extends FriendlyError {}

function geminiError(response: RequestUrlResponse | null): FriendlyError {
	if (!response) return new FriendlyError("Não foi possível falar com o Gemini. Verifique a internet.");
	const message = readJson<GeminiResponse>(response)?.error?.message ?? "";
	if (response.status === 429) {
		return new FriendlyError(
			skipFor(429, response.text).daily
				? "O limite gratuito de hoje da sua chave do Gemini acabou. Tente amanhã."
				: "Muitos pedidos seguidos para o Gemini. Espere um minuto e tente de novo."
		);
	}
	if (/API key/i.test(message) || response.status === 401 || response.status === 403) {
		return new KeyError("Chave do Gemini inválida. Confira nas configurações do plugin.");
	}
	if (response.status === 404) return new FriendlyError("Modelo do Gemini não encontrado. Escolha outro nas configurações.");
	if (response.status === 503) return new FriendlyError("O Gemini está muito ocupado agora. Tente de novo em alguns instantes.");
	return new FriendlyError(`O Gemini respondeu com erro ${response.status}${message ? `: ${message}` : "."}`);
}

/** Modelos esgotados ou lotados nesta sessão, e até quando pular cada um. */
const skipped = new Map<string, number>();

/**
 * Com o modelo "auto", tenta cada modelo de GEMINI_MODELS, começando pelos que não estão
 * esgotados ou lotados. Passa para o próximo quando um falha ou demora; para logo se o
 * problema é da chave.
 */
async function askGemini(text: string, instructions: string, key: string, model: string): Promise<string> {
	if (model !== DEFAULT_GEMINI_MODEL) return askGeminiModel(text, instructions, key, { id: model });
	const now = Date.now();
	const isSkipped = (m: GeminiModel) => (skipped.get(m.id) ?? 0) > now;
	const order = [...GEMINI_MODELS.filter((m) => !isSkipped(m)), ...GEMINI_MODELS.filter(isSkipped)];
	let lastError: FriendlyError | null = null;
	for (const candidate of order) {
		try {
			return await askGeminiModel(text, instructions, key, candidate, ATTEMPT_MS);
		} catch (error) {
			if (!(error instanceof FriendlyError) || error instanceof KeyError) throw error;
			lastError = error;
		}
	}
	throw lastError ?? new FriendlyError(AI_TIMEOUT);
}

async function askGeminiModel(
	text: string,
	instructions: string,
	key: string,
	model: GeminiModel,
	timeoutMs?: number
): Promise<string> {
	let response: RequestUrlResponse | null;
	try {
		response = await request(`${GEMINI_API}/models/${encodeURIComponent(model.id)}:generateContent`, {
			method: "POST",
			timeoutMs,
			timeoutMessage: AI_TIMEOUT,
			headers: { "x-goog-api-key": key },
			body: geminiRequestBody(model, instructions, text),
		});
	} catch (error) {
		skipped.set(model.id, Date.now() + skipFor(0, "").ms);
		throw error;
	}
	if (response?.status !== 200) {
		if (response) {
			const skip = skipFor(response.status, response.text);
			if (skip.ms) skipped.set(model.id, Date.now() + skip.ms);
		}
		throw geminiError(response);
	}
	const parts = readJson<GeminiResponse>(response)?.candidates?.[0]?.content?.parts ?? [];
	const answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
	if (!answer.trim()) throw new FriendlyError("O Gemini não devolveu texto (pode ter sido bloqueado pelos filtros).");
	return answer;
}

async function askServer(
	text: string,
	url: string,
	type: TextType,
	userRequest: string,
	lines: number | undefined
): Promise<string> {
	const response = await request(`${url.replace(/\/+$/, "")}/improve`, {
		method: "POST",
		timeoutMessage: AI_TIMEOUT,
		body: { text, type, ...(userRequest ? { request: userRequest } : {}), ...(lines ? { lines } : {}) },
	});
	if (!response) throw new FriendlyError("Não foi possível falar com o servidor do plugin. Verifique a internet.");
	const data = readJson<ServerResponse>(response);
	if (response.status !== 200) {
		throw new FriendlyError(data?.error ?? `O servidor do plugin respondeu com erro ${response.status}.`);
	}
	return data?.text ?? "";
}

async function askOllama(text: string, instructions: string, url: string, model: string): Promise<string> {
	if (!model) throw new FriendlyError("Escolha um modelo do Ollama nas configurações do plugin.");
	const response = await request(`${url.replace(/\/+$/, "")}/api/chat`, {
		method: "POST",
		timeoutMs: OLLAMA_TIMEOUT_MS,
		timeoutMessage: AI_TIMEOUT,
		body: {
			model,
			stream: false,
			messages: [
				{ role: "system", content: instructions },
				{ role: "user", content: text },
			],
			options: { temperature: 0.2 },
		},
	});
	if (!response) throw new FriendlyError("O Ollama não está rodando. Abra o Ollama e tente de novo.");
	if (response.status === 404) throw new FriendlyError(`Modelo "${model}" não encontrado no Ollama.`);
	if (response.status !== 200) throw new FriendlyError(`O Ollama respondeu com erro ${response.status}.`);
	return readJson<OllamaResponse>(response)?.message?.content ?? "";
}

export interface AiOptions {
	engine: AiEngine;
	/** Só para testes: troca o endereço do servidor do plugin. */
	serverUrl?: string;
	geminiKey: string | null;
	geminiModel: string;
	ollamaUrl: string;
	ollamaModel: string;
	/** Prompt editado nas configurações ("" = padrão). Não vale para o servidor do plugin. */
	customPrompt: string;
	/** Tipo de texto escolhido ("auto" = a IA decide). */
	type?: TextType;
	/** Pedido livre da pessoa, como "deixe mais formal". */
	request?: string;
}

/** Revisa `text` com a IA escolhida, mantendo intactos links, código e formatação. */
export async function improveWithAi(text: string, options: AiOptions): Promise<string> {
	if (text.includes("⟦")) throw new FriendlyError("O texto tem o caractere ⟦, que o plugin usa internamente. Remova-o e tente de novo.");
	// As pontas (espaços e quebras de linha) ficam como estão; só o miolo vai para a IA.
	const lead = text.match(/^\s*\n|^/)?.[0] ?? "";
	const trail = text.match(/\s*$/)?.[0] ?? "";
	const core = text.slice(lead.length, text.length - trail.length);
	const lineMode = splitLines(core);
	const safe = protect(lineMode ? lineMode.body : core);
	const { masked } = safe;
	const type = options.type ?? "auto";
	const userRequest = options.request?.trim() ?? "";
	const lines = lineMode?.count;
	// O servidor do plugin monta as instruções do lado dele, sempre com o prompt padrão.
	const instructions = buildPrompt(options.customPrompt || DEFAULT_PROMPT, { type, request: userRequest, lines });
	let answer: string;
	if (options.engine === "server") {
		answer = await askServer(masked, options.serverUrl || SERVER_URL, type, userRequest, lines);
	} else if (options.engine === "gemini") {
		if (!options.geminiKey) throw new FriendlyError("Coloque a sua chave do Gemini nas configurações do plugin.");
		answer = await askGemini(masked, instructions, options.geminiKey, options.geminiModel || DEFAULT_GEMINI_MODEL);
	} else {
		answer = await askOllama(masked, instructions, options.ollamaUrl || DEFAULT_OLLAMA_URL, options.ollamaModel);
	}
	const restored = restore(cleanAnswer(answer), safe);
	if (restored === null) {
		console.debug("Po1ish: resposta recusada (links ou formatação alterados).", { enviado: masked, recebido: answer });
		throw new FriendlyError("A IA alterou links ou formatação, então nada foi mudado. Tente de novo.");
	}
	if (!lineMode) return lead + (core.match(/^\s*/)?.[0] ?? "") + restored.trim() + trail;
	const joined = joinLines(restored, lineMode);
	if (joined === null) {
		console.debug("Po1ish: resposta recusada (número de linhas mudou).", { enviado: masked, recebido: answer });
		throw new FriendlyError("A IA juntou ou separou as linhas da lista, então nada foi mudado. Tente de novo.");
	}
	return lead + joined + trail;
}

/** Modelos do Gemini que geram texto, para escolher nas configurações. */
export async function listGeminiModels(key: string): Promise<Record<string, string>> {
	const response = await request(`${GEMINI_API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
	if (response?.status !== 200) throw geminiError(response);
	const models: Record<string, string> = {};
	for (const model of readJson<GeminiResponse>(response)?.models ?? []) {
		const id = (model.name ?? "").replace(/^models\//, "");
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
	return (readJson<OllamaResponse>(response)?.models ?? []).map((model) => model.name ?? "").filter(Boolean);
}
