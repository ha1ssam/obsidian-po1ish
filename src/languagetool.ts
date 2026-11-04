import { FriendlyError, request } from "./http";

/**
 * Pedaço do texto: `text` é revisado, `markup` (sintaxe Markdown, links, código) é ignorado.
 * `interpretAs` faz um link ou código contar como uma palavra, para a frase continuar fazendo sentido.
 */
type Segment = { text: string } | { markup: string; interpretAs?: string };

/** Marcações que ficam no meio da frase no lugar de uma palavra. */
const INLINE_OBJECT = /^(?:`|\[\[|https?:|<|\$|#[^\s#])/;

interface Match {
	offset: number;
	length: number;
	replacements: { value: string }[];
}

/**
 * Trechos que não são texto corrido. O LanguageTool pula esses trechos,
 * então não "corrige" links, código, tags nem marcadores de lista.
 */
const MARKUP = new RegExp(
	[
		"```[\\s\\S]*?(?:```|$)", // bloco de código
		"`[^`\\n]*`", // código inline
		"\\[\\[[^\\]\\n]*\\]\\]", // [[wikilink]]
		"!?\\[(?=[^\\]\\n]*\\]\\()", // abertura de [texto](url)
		"\\]\\([^)\\n]*\\)", // fechamento ](url)
		"https?:\\/\\/[^\\s)>\\]]+", // URL solta
		"<[^>\\n]+>", // tag HTML
		"\\$\\$[\\s\\S]*?\\$\\$|\\$[^$\\n]+\\$", // LaTeX
		"^[ \\t]*(?:[-*+]|\\d+[.)])[ \\t]+(?:\\[.\\][ \\t]+)?", // item de lista / tarefa
		"^[ \\t]*#{1,6}[ \\t]+", // título
		"^[ \\t]*>[ \\t]?", // citação
		"(?<=^|\\s)#[^\\s#]+", // #tag
		"\\*\\*|~~|==|\\*", // negrito, riscado, destaque, itálico
	].join("|"),
	"gm"
);

export function toSegments(text: string): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	MARKUP.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = MARKUP.exec(text))) {
		if (!match[0]) {
			MARKUP.lastIndex++;
			continue;
		}
		const start = match.index;
		if (start > last) segments.push({ text: text.slice(last, start) });
		segments.push(
			INLINE_OBJECT.test(match[0]) && !match[0].startsWith("```")
				? { markup: match[0], interpretAs: "X" }
				: { markup: match[0] }
		);
		last = start + match[0].length;
	}
	if (last < text.length) segments.push({ text: text.slice(last) });
	return segments;
}

/** Devolve o texto corrigido e quantas correções foram aplicadas. */
export async function improveText(
	text: string,
	language: string,
	server: string
): Promise<{ text: string; fixes: number }> {
	const segments = toSegments(text);
	const body = new URLSearchParams({
		language,
		data: JSON.stringify({ annotation: segments }),
	});

	// Posição de cada marcação no texto: nenhuma correção pode encostar nelas.
	const protectedRanges: [number, number][] = [];
	let position = 0;
	for (const segment of segments) {
		const length = "text" in segment ? segment.text.length : segment.markup.length;
		if ("markup" in segment) protectedRanges.push([position, position + length]);
		position += length;
	}
	const touchesMarkup = (m: Match) =>
		protectedRanges.some(([start, end]) => m.offset < end && m.offset + m.length > start);
	if (language === "auto") body.set("preferredVariants", "pt-BR,en-US");

	const response = await request(`${server.replace(/\/+$/, "")}/v2/check`, {
		method: "POST",
		contentType: "application/x-www-form-urlencoded",
		body: body.toString(),
		timeoutMessage: "O LanguageTool demorou demais para responder. Tente de novo em alguns minutos.",
	});
	if (!response) throw new FriendlyError("Não foi possível falar com o LanguageTool. Verifique a internet.");
	if (response.status === 429) {
		throw new FriendlyError("Muitos pedidos seguidos. Espere um minuto e tente de novo.");
	}
	if (response.status !== 200) {
		throw new FriendlyError(`O LanguageTool respondeu com erro ${response.status}.`);
	}

	// Aplica de trás para frente para não deslocar os offsets; pula correções sobrepostas.
	const matches = ((response.json?.matches ?? []) as Match[])
		.filter((m) => m.replacements.length > 0 && !touchesMarkup(m))
		.sort((a, b) => b.offset - a.offset);
	let result = text;
	let limit = text.length;
	let fixes = 0;
	for (const m of matches) {
		if (m.offset + m.length > limit) continue;
		result = result.slice(0, m.offset) + m.replacements[0].value + result.slice(m.offset + m.length);
		limit = m.offset;
		fixes++;
	}
	return { text: result, fixes };
}
