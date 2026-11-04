import { RequestUrlResponse, requestUrl } from "obsidian";

/** Erro com uma mensagem pronta para mostrar a quem usa o plugin. */
export class FriendlyError extends Error {}

/**
 * Lê o corpo da resposta como JSON do tipo esperado.
 * Devolve null se não for JSON (ex.: página de erro em HTML).
 */
export function readJson<T>(response: RequestUrlResponse): Partial<T> | null {
	try {
		const data: unknown = response.json;
		return data && typeof data === "object" ? (data) : null;
	} catch {
		return null;
	}
}

/** Tempo máximo de espera padrão. */
const TIMEOUT_MS = 50000;

export interface RequestOptions {
	method?: string;
	headers?: Record<string, string>;
	/** Objeto vira JSON; string é enviada como está (use `contentType`). */
	body?: unknown;
	contentType?: string;
	timeoutMs?: number;
	/** Mensagem mostrada se passar do tempo. */
	timeoutMessage?: string;
}

/**
 * Faz o pedido sem nunca ficar esperando para sempre.
 * Devolve null se não houver conexão; lança FriendlyError se passar de `timeoutMs`.
 */
export async function request(url: string, options: RequestOptions = {}): Promise<RequestUrlResponse | null> {
	const isJson = options.body !== undefined && typeof options.body !== "string";
	const pending = requestUrl({
		url,
		method: options.method ?? "GET",
		headers: options.headers,
		contentType: options.contentType ?? (isJson ? "application/json" : undefined),
		body: options.body === undefined ? undefined : isJson ? JSON.stringify(options.body) : (options.body as string),
		throw: false,
	}).then(
		(response) => response,
		() => null
	);

	let timer: number | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = window.setTimeout(
			() => reject(new FriendlyError(options.timeoutMessage ?? "Demorou demais para responder. Tente de novo em alguns minutos.")),
			options.timeoutMs ?? TIMEOUT_MS
		);
	});
	try {
		return await Promise.race([pending, timeout]);
	} finally {
		window.clearTimeout(timer);
	}
}
