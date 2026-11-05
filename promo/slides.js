// Monta cada imagem de divulgação. Ver promo/README.md.
const P = window.Promo;
const params = new URLSearchParams(location.search);
const FORMAT = params.get("f") || "portrait";
const SLIDE = params.get("s") || "menu";
const L = FORMAT === "landscape";

const h = (tag, attrs = {}, ...kids) => {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") el.className = v;
		else if (k === "style") el.style.cssText = v;
		else if (k === "html") el.innerHTML = v;
		else el.setAttribute(k, v);
	}
	for (const kid of kids.flat()) if (kid != null) el.append(kid);
	return el;
};

// Ícones Lucide (os mesmos do Obsidian).
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
	scissors: svg('<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'),
	copy: svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
	paste: svg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
	spell: svg('<path d="m6 16 6-12 6 12M8 12h8m0 8 2 2 4-4"/>'),
	sparkles: svg('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>'),
	list: svg('<path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13"/>'),
	square: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
	bug: svg('<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'),
	commit: svg('<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>'),
	heading: svg('<path d="M6 12h12M6 20V4M18 20V4"/>'),
	chat: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
	check: svg('<path d="M20 6 9 17l-5-5"/>'),
	cloud: svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
	key: svg('<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'),
	laptop: svg('<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>'),
	shield: svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
	keyboard: svg('<path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>'),
};
const chip = (icon, text) => h("span", { class: "chip", html: ICON[icon] }, text);
const brand = () => h("div", { class: "brand" }, h("img", { src: "../assets/icon.png", alt: "" }),
	h("span", { html: 'Po<span class="one">1</span>ish' }));

function frame(eyebrow, title, sub, stage) {
	const slide = h("div", { class: `slide ${FORMAT}` });
	const text = [h("p", { class: "eyebrow" }, eyebrow), h("h1", { html: title }), sub ? h("p", { class: "sub", html: sub }) : null];
	const t = text.filter(Boolean);
	if (L) slide.append(h("div", { class: "left" }, ...t, brand()), h("div", { class: "stage" }, stage));
	else slide.append(...t, h("div", { class: "stage" }, stage), brand());
	document.body.append(slide);
	return slide;
}

/** Card com um exemplo de antes e depois. */
const pair = (icon, kind, before, after) => h("div", { class: "panel pair" },
	h("div", { class: "kind", html: ICON[icon] }, kind),
	h("div", { class: "before" }, before),
	h("div", { class: "after", html: after }));

/** Texto em Markdown com o que a IA não vê destacado (usa o código do plugin). */
const markdown = (text, fixes = []) => {
	const el = h("div", { class: "md" });
	for (const s of P.segments(text)) {
		if (s.markup != null) { el.append(h("span", { class: "mk" }, s.markup)); continue; }
		// Destaca as palavras corrigidas no "depois".
		let rest = s.text;
		const re = fixes.length ? new RegExp(`(${fixes.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`) : null;
		while (re && rest) {
			const m = re.exec(rest);
			if (!m) break;
			el.append(rest.slice(0, m.index), h("span", { class: "fix" }, m[0]));
			rest = rest.slice(m.index + m[0].length);
		}
		if (rest) el.append(rest);
	}
	return el;
};

const SLIDES = {
	menu() {
		const item = (icon, text, cls = "") => h("div", { class: `menu-item ${cls}`, html: ICON[icon] }, text);
		const menu = h("div", { class: "menu" },
			item("scissors", "Cut", "dim"), item("copy", "Copy", "dim"), item("paste", "Paste", "dim"),
			h("div", { class: "menu-separator" }),
			item("spell", "Corrigir ortografia"),
			item("sparkles", "Polir texto com IA", "selected"),
			item("list", "Polir texto como…"),
			item("square", "Polir com instrução…"));
		const note = h("div", { class: "note", style: "box-shadow:0 18px 40px rgba(20,10,60,.4)" },
			h("span", { class: "sel" }, "essa desc e otima, vc ja viu a [[Nota]]? tem q revisar oque falta"), h("span", { class: "caret" }));
		const right = h("div", { style: `display:flex;flex-direction:column;align-items:flex-end;flex:1;${L ? "padding-top:8px" : ""}` },
			note, h("div", { style: `margin-top:-6px;margin-right:${L ? 18 : 30}px` }, menu));
		const info = h("div", { style: "display:flex;flex-direction:column;" + (L ? "width:150px;flex:none" : "gap:16px") },
			h("div", { class: "logo1", html: '1<svg viewBox="0 0 24 24"><path d="M12 0c.8 6.4 4.6 10.6 12 12-7.4 1.4-11.2 5.6-12 12-.8-6.4-4.6-10.6-12-12C7.4 10.6 11.2 6.4 12 0z"/></svg>' }),
			h("div", { style: L ? "margin-top:auto" : "" },
				h("div", { class: "kicker" }, "Obsidian plugin"),
				h("div", { class: "title", html: 'Po<span class="one">1</span>ish' }),
				h("div", { class: "text" }, "Fix spelling or polish any text with AI. No setup.")),
			L ? h("div", { class: "foot", style: "margin-top:auto" }, "Desktop", h("br"), "and mobile") : null);
		if (!L) { info.style.flexDirection = "row"; info.style.alignItems = "flex-start"; }
		const hero = h("div", { class: "hero", style: L ? "height:500px;width:100%;padding:24px;gap:18px" : "flex-direction:column;gap:22px;padding-bottom:30px" }, info, right);
		frame("Menu", "Select text. Right&#8209;click. Polish.", null, hero);
	},
	async preview() {
		const box = h("div", { style: `width:${L ? 540 : 452}px` });
		frame("Preview", "See it before it&nbsp;changes.",
			"Edit the result, then <b>Aplicar</b> (Ctrl+Enter), <b>Copiar</b> or <b>Tentar de novo</b>.", box);
		await P.preview(box, {
			title: "Polir texto com IA",
			before: "oi pessoal, so pra avisar q o deploy de hj foi adiado pra amanha pq achamos um bug no login, qlqr coisa me chamem",
			after: "Oi, pessoal! Só para avisar que o deploy de hoje foi adiado para amanhã, porque encontramos um bug no login. Qualquer coisa, me chamem.",
		});
	},
	types() {
		const T = P.types;
		const grid = h("div", { style: `display:grid;grid-template-columns:${L ? "1fr 1fr" : "1fr"};gap:${L ? 10 : 12}px;width:100%` },
			pair("bug", T.problem, "quando coloco a mesma data nos dois campos nao aparece nada",
				'Ao preencher os campos <b>"Data de Início"</b> e <b>"Data de Fim"</b> com a mesma data, nenhum resultado é exibido.'),
			pair("commit", T.change, "corrigi o combo que nao carregava",
				'Corrigido o carregamento do combo <b>"Fornecedor"</b>, que impedia a filtragem.'),
			pair("heading", T.title, "Problema que o filtro de fornecedor não está carregando",
				'Filtro <b>"Fornecedor"</b> não carrega resultados'),
			pair("chat", T.message, "bom dia loryn, conseguiu ver o relatorio? so tem mais 1 pra revisar",
				"Bom dia, Loryn! Conseguiu ver o relatório? Só resta mais um para revisar."));
		frame("Text types", "It knows what you're&nbsp;writing.",
			"Bug reports, changes, titles, messages, summaries and prompts. Or pick the kind with <b>Polir texto como…</b>", grid);
	},
	instruction() {
		const box = h("div", { style: `width:${L ? 520 : 452}px;display:flex;flex-direction:column;gap:${L ? 14 : 18}px` });
		frame("Your words", "Tell it what you&nbsp;want.",
			"Write things like <b>deixe mais formal</b>, <b>resuma em uma frase</b> or <b>transforme em lista</b>.", box);
		const modalBox = h("div");
		box.append(modalBox, pair("square", "deixe mais formal",
			"galera, amanha a reuniao vai ser 15h e nao 14h, tragam o relatorio",
			"Prezados, informo que a reunião de amanhã foi remarcada para as 15h. Por favor, tragam o relatório."));
		P.request(modalBox, "deixe mais formal");
	},
	markdown() {
		const before = "- [ ] revisar o [[Roteiro de testes]] ate sexta #qa\n- o endpoint `/api/pedidos` da erro c/ filtro vazio\n- **importante**: ve o [guia](https://obsidian.md)";
		const after = "- [ ] Revisar o [[Roteiro de testes]] até sexta. #qa\n- O endpoint `/api/pedidos` dá erro com o filtro vazio.\n- **Importante**: veja o [guia](https://obsidian.md).";
		const panel = h("div", { class: "panel", style: `padding:${L ? "18px 20px" : "20px 18px"};width:100%` },
			h("div", { class: "tag" }, "Antes"), markdown(before),
			h("div", { style: "height:1px;background:#2e2e2e;margin:16px 0" }),
			h("div", { class: "tag ok", html: ICON.check }, "Depois"), markdown(after, ["Revisar", "até", "sexta.", "O endpoint", "dá", "com o", "vazio.", "Importante", "veja", ")."]));
		const legend = h("div", { class: "chips", style: "margin-top:14px" },
			h("span", { class: "chip" }, h("span", { style: "width:12px;height:12px;border-radius:3px;background:rgba(139,108,239,.35)" }), "Never sent to the AI"),
			h("span", { class: "chip" }, h("span", { style: "width:12px;height:12px;border-radius:3px;background:rgba(74,222,128,.3)" }), "Fixed"));
		frame("Markdown", "Your Markdown stays&nbsp;put.",
			"Links, tags, code, URLs and list markers never reach the AI. If one changes, nothing is applied.",
			h("div", { style: "width:100%" }, panel, legend));
	},
	engines() {
		const card = (icon, name, badge, desc) => h("div", { class: "panel engine" },
			h("span", { class: "ic", html: ICON[icon] }),
			h("div", {}, h("div", { class: "name" }, name, badge ? h("span", { class: "badge" }, badge) : null), h("div", { class: "desc" }, desc)));
		const list = h("div", { style: `display:flex;flex-direction:column;gap:${L ? 10 : 12}px;width:100%` },
			card("cloud", "Plugin default", "no setup", "Google Gemini through the plugin's server. Just install and use."),
			card("key", "Your own Gemini key", "free", "Daily limits that are only yours. The key stays in Obsidian's Keychain."),
			card("laptop", "Ollama", "offline", "Runs on your computer, so the text never leaves it. Desktop only."),
			card("spell", "LanguageTool", null, "Spell check with no AI, right away, in Portuguese, English or Spanish."));
		const chips = h("div", { class: "chips", style: `margin-top:${L ? 14 : 18}px` },
			chip("shield", "Only the selected text is sent"), chip("keyboard", "A hotkey for every option"));
		frame("AI engines", "No setup. Or fully&nbsp;offline.", null, h("div", { style: "width:100%" }, list, chips));
	},
};

(async () => {
	await SLIDES[SLIDE]();
	await document.fonts.ready;
	document.body.dataset.ready = "1";
})();
