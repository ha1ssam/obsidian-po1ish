/**
 * Servidor do plugin Po1ish, na Cloudflare.
 * Guarda a chave do Gemini como segredo (GEMINI_KEY), para quem usa o plugin não precisar de uma.
 * Só revisa texto: usa sempre o prompt padrão guardado aqui (o editado nas configurações não vale),
 * e o pedido livre e a resposta têm tamanho limitado. Assim não serve como acesso livre ao Gemini.
 */
import {
	ATTEMPT_MS,
	DEFAULT_PROMPT,
	GEMINI_MODELS,
	GeminiModel,
	MAX_CHARS,
	MAX_REQUEST_CHARS,
	buildPrompt,
	geminiRequestBody,
	isTextType,
	skipFor,
} from "../../src/prompt";

interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
	GEMINI_KEY: string;
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

/** Resposta no máximo um pouco maior que o texto: a IA não vira gerador de textos longos. */
const maxOutputTokens = (text: string) => Math.min(8192, Math.ceil(text.length / 2) + 1500);

/**
 * Modelos esgotados ou lotados, e até quando pular cada um. Fica na memória do Worker:
 * assim o próximo pedido não perde tempo tentando um modelo que já sabemos que vai falhar.
 */
const skipped = new Map<string, { until: number; daily: boolean }>();

/** Devolve o texto revisado, ou o status do erro (0 = demorou demais ou sem conexão). */
async function askGemini(
	api: string,
	model: GeminiModel,
	key: string,
	instructions: string,
	text: string,
	cancel: AbortSignal
): Promise<string | number> {
	try {
		const response = await fetch(`${api}/models/${encodeURIComponent(model.id)}:generateContent`, {
			method: "POST",
			signal: AbortSignal.any([AbortSignal.timeout(ATTEMPT_MS), cancel]),
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: JSON.stringify(geminiRequestBody(model, instructions, text, maxOutputTokens(text))),
		});
		if (!response.ok) {
			const body = await response.text();
			// Detalhes só no log da Cloudflare, para não expor nada da conta.
			console.error("Gemini", model.id, response.status, body.slice(0, 300));
			const skip = skipFor(response.status, body);
			if (skip.ms) skipped.set(model.id, { until: Date.now() + skip.ms, daily: skip.daily });
			return response.status;
		}
		const data = (await response.json()) as {
			candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
		};
		const parts = data.candidates?.[0]?.content?.parts ?? [];
		const answer = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
		return answer.trim() ? answer : 502;
	} catch {
		// Cancelado porque outro modelo respondeu antes: não é problema deste modelo.
		if (cancel.aborted) return 0;
		console.error("Gemini", model.id, "demorou mais de", ATTEMPT_MS, "ms");
		skipped.set(model.id, { until: Date.now() + skipFor(0, "").ms, daily: false });
		return 0;
	}
}

/** Se um modelo não respondeu nesse tempo, o próximo começa em paralelo. */
const STAGGER_MS = 2500;

/**
 * Tenta os modelos em ordem, mas sem esperar um falhar para começar o próximo: depois de
 * STAGGER_MS sem resposta (ou logo que um falha), o seguinte começa junto. Vale a primeira
 * resposta boa; os outros pedidos são cancelados. Devolve null se todos falharem.
 */
function race(order: GeminiModel[], ask: (model: GeminiModel, cancel: AbortSignal) => Promise<string | number>) {
	const controller = new AbortController();
	return new Promise<string | null>((resolve) => {
		let next = 0;
		let running = 0;
		let finished = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finish = (value: string | null) => {
			finished = true;
			clearTimeout(timer);
			controller.abort();
			resolve(value);
		};
		const startNext = () => {
			clearTimeout(timer);
			if (finished || next >= order.length) return;
			const model = order[next++];
			running++;
			timer = setTimeout(startNext, STAGGER_MS);
			void ask(model, controller.signal).then((result) => {
				running--;
				if (finished) return;
				if (typeof result === "string") return finish(result);
				startNext();
				if (running === 0 && next >= order.length) finish(null);
			});
		};
		startNext();
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		const api = env.GEMINI_API ?? "https://generativelanguage.googleapis.com/v1beta";
		if (pathname !== "/improve") return fail("Não encontrado.", 404);
		if (request.method !== "POST") return fail("Use POST.", 405);

		// Limite por pessoa (IP), para ninguém gastar a cota diária de todo mundo.
		const ip = request.headers.get("CF-Connecting-IP") ?? "local";
		if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
			return fail("Muitos pedidos seguidos. Espere um minuto e tente de novo.", 429);
		}

		let body: { text?: unknown; type?: unknown; request?: unknown; lines?: unknown };
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return fail("Pedido inválido.", 400);
		}
		const { text, type, request: userRequest, lines } = body;
		if (typeof text !== "string" || !text.trim()) return fail("Envie o texto em { text }.", 400);
		if (text.length > MAX_CHARS) return fail("Texto grande demais. Envie até 20 mil caracteres.", 413);
		if (type !== undefined && !isTextType(type)) return fail("Tipo de texto desconhecido.", 400);
		if (lines !== undefined && !(Number.isInteger(lines) && (lines as number) >= 1 && (lines as number) <= 1000)) {
			return fail("Número de linhas inválido.", 400);
		}
		if (userRequest !== undefined && typeof userRequest !== "string") return fail("Pedido inválido.", 400);
		if (typeof userRequest === "string" && userRequest.length > MAX_REQUEST_CHARS) {
			return fail(`Pedido grande demais. Use até ${MAX_REQUEST_CHARS} caracteres.`, 413);
		}
		if (!env.GEMINI_KEY) return fail("O servidor do plugin está sem chave configurada.", 503);

		const instructions = buildPrompt(DEFAULT_PROMPT, {
			type: isTextType(type) ? type : undefined,
			request: typeof userRequest === "string" ? userRequest : undefined,
			lines: typeof lines === "number" ? lines : undefined,
		});

		// Primeiro os modelos disponíveis; os pulados só se nenhum outro estiver livre.
		const now = Date.now();
		const isSkipped = (model: GeminiModel) => (skipped.get(model.id)?.until ?? 0) > now;
		const order = [...GEMINI_MODELS.filter((m) => !isSkipped(m)), ...GEMINI_MODELS.filter(isSkipped)];
		const answer = await race(order, (model, cancel) => askGemini(api, model, env.GEMINI_KEY, instructions, text, cancel));
		if (answer) return json({ text: answer });

		const allDaily = GEMINI_MODELS.every((m) => skipped.get(m.id)?.daily);
		return allDaily
			? fail("O limite gratuito de hoje do servidor do plugin acabou. Tente amanhã, ou use a sua própria chave do Gemini ou o Ollama.", 429)
			: fail("A IA está muito ocupada agora. Tente de novo em alguns instantes.", 503);
	},
};
