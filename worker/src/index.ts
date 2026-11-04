/**
 * Servidor do plugin Po1ish, na Cloudflare.
 * Guarda a chave do Gemini como segredo (GEMINI_KEY), para quem usa o plugin não precisar de uma.
 * Só revisa texto: o prompt é fixo aqui, então não serve como acesso livre ao Gemini.
 */
import { MAX_CHARS, PROMPT } from "../../src/prompt";

interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
	GEMINI_KEY: string;
	GEMINI_MODEL?: string;
	/** Só para testes locais: troca o endereço da API do Gemini. */
	GEMINI_API?: string;
	LIMITER?: RateLimiter;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});

const fail = (error: string, status: number) => json({ error }, status);

/**
 * Modelos tentados em ordem. Os "lite" respondem em 1 a 3 segundos; o Flash comum às vezes
 * passa de um minuto quando está lotado. Se um falhar ou demorar, tenta o próximo.
 */
const DEFAULT_MODELS = "gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3-flash-preview";
/** Tempo máximo de cada tentativa. */
const ATTEMPT_MS = 20000;

/** Devolve o texto revisado, ou o status do erro (0 = demorou demais ou sem conexão). */
async function askGemini(api: string, model: string, key: string, text: string): Promise<string | number> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ATTEMPT_MS);
	try {
		const response = await fetch(`${api}/models/${encodeURIComponent(model)}:generateContent`, {
			method: "POST",
			signal: controller.signal,
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: PROMPT }] },
				contents: [{ role: "user", parts: [{ text }] }],
				generationConfig: { temperature: 0.2 },
			}),
		});
		if (!response.ok) {
			// Detalhes só no log da Cloudflare, para não expor nada da conta.
			console.error("Gemini", model, response.status, (await response.text()).slice(0, 300));
			return response.status;
		}
		const data = (await response.json()) as {
			candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
		};
		const parts = data.candidates?.[0]?.content?.parts ?? [];
		const answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
		return answer.trim() ? answer : 502;
	} catch {
		console.error("Gemini", model, "demorou mais de", ATTEMPT_MS, "ms");
		return 0;
	} finally {
		clearTimeout(timer);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname !== "/improve") return fail("Não encontrado.", 404);
		if (request.method !== "POST") return fail("Use POST.", 405);

		// Limite por pessoa (IP), para ninguém gastar a cota diária de todo mundo.
		const ip = request.headers.get("CF-Connecting-IP") ?? "local";
		if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
			return fail("Muitos pedidos seguidos. Espere um minuto e tente de novo.", 429);
		}

		let text: unknown;
		try {
			({ text } = (await request.json()) as { text?: unknown });
		} catch {
			return fail("Pedido inválido.", 400);
		}
		if (typeof text !== "string" || !text.trim()) return fail("Envie o texto em { text }.", 400);
		if (text.length > MAX_CHARS) return fail("Texto grande demais. Envie até 20 mil caracteres.", 413);
		if (!env.GEMINI_KEY) return fail("O servidor do plugin está sem chave configurada.", 503);

		const api = env.GEMINI_API ?? "https://generativelanguage.googleapis.com/v1beta";
		const models = (env.GEMINI_MODEL || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
		let quotaOver = false;
		for (const model of models) {
			const result = await askGemini(api, model, env.GEMINI_KEY, text);
			if (typeof result === "string") return json({ text: result });
			if (result === 429) quotaOver = true;
		}
		return quotaOver
			? fail("O limite gratuito de hoje acabou. Tente amanhã, ou use a sua própria chave ou o Ollama.", 429)
			: fail("A IA está lenta ou fora do ar agora. Tente de novo em alguns minutos.", 502);
	},
};
