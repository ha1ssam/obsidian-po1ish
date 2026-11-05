// Monta cada imagem de divulgação. Ver promo/README.md.
// Cada imagem tem o mesmo conteúdo nas duas versões; só o layout muda.
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

/**
 * O logo, com a mesma geometria do assets/icon.png (grade de 512):
 * quadrado em x 0–480, y 32–512, e a estrela com centro em (427, 85).
 * Use sempre esta função, para a estrela ficar no mesmo lugar em todas as imagens.
 */
const logo = ({ square = "#8b6cef", one = "#181818", star = "#c9b8ff" } = {}) =>
	`<svg class="logo" viewBox="0 0 512 512" aria-hidden="true">` +
	`<rect y="32" width="480" height="480" rx="120" fill="${square}"/>` +
	`<path d="M237 155H297V409H237V208L178 246V190Z" fill="${one}"/>` +
	`<path d="M427 -1Q439 73 513 85Q439 97 427 171Q415 97 341 85Q415 73 427 -1Z" fill="${star}"/></svg>`;

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
};
const brand = () => h("div", { class: "brand" }, h("span", { html: logo() }),
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
	const re = fixes.length ? new RegExp(`(${fixes.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`) : null;
	for (const s of P.segments(text)) {
		if (s.markup != null) { el.append(h("span", { class: "mk" }, s.markup)); continue; }
		// Destaca as palavras corrigidas no "depois".
		let rest = s.text;
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
			item("spell", "Fix spelling"),
			item("sparkles", "Polish text with AI", "selected"),
			item("list", "Polish text as…"),
			item("square", "Polish with instruction…"));
		const note = h("div", { class: "note", style: "box-shadow:0 18px 40px rgba(20,10,60,.4)" },
			h("span", { class: "sel" }, "this desc is grate, did u see the [[Note]]? need to check whats missing"), h("span", { class: "caret" }));
		const right = h("div", { style: `display:flex;flex-direction:column;align-items:flex-end;flex:1;${L ? "padding-top:8px" : ""}` },
			note, h("div", { style: `margin-top:-6px;margin-right:${L ? 18 : 30}px` }, menu));
		const about = [
			h("div", { class: "kicker" }, "Obsidian plugin"),
			h("div", { class: "title", html: 'Po<span class="one">1</span>ish' }),
			h("div", { class: "text" }, "Fix spelling or polish any text with AI. No setup."),
		];
		const foot = h("div", { class: "foot" }, "Desktop and mobile");
		const mark = h("div", { class: "logo1", html: logo({ square: "#161616", one: "#8b6cef" }) });
		const info = L
			? h("div", { style: "display:flex;flex-direction:column;width:150px;flex:none" },
				mark, h("div", { style: "margin-top:auto" }, ...about), h("div", { style: "margin-top:auto" }, foot))
			: h("div", { style: "display:flex;gap:18px;align-items:flex-start" },
				mark, h("div", {}, ...about, h("div", { style: "margin-top:10px" }, foot)));
		const hero = h("div", { class: "hero", style: L ? "height:500px;width:100%;padding:24px;gap:18px" : "flex-direction:column;gap:22px;padding-bottom:30px" }, info, right);
		frame("Menu", "Select text. Right&#8209;click. Polish.", null, hero);
	},
	async preview() {
		const box = h("div", { style: `width:${L ? 540 : 452}px` });
		frame("Preview", "See it before it&nbsp;changes.",
			"Edit the result, then <b>Apply</b> (Ctrl+Enter), <b>Copy</b> or <b>Try again</b>.", box);
		await P.preview(box, {
			title: "Polish text with AI",
			before: "hey guys just a heads up the deploy for today got pushed to tomorow bc we found a bug in the login, ping me if u need anything",
			after: "Hi everyone! Just a heads-up: today's deploy has been moved to tomorrow because we found a bug in the login. Ping me if you need anything.",
		});
	},
	types() {
		const grid = h("div", { style: `display:grid;grid-template-columns:${L ? "1fr 1fr" : "1fr"};gap:${L ? 10 : 12}px;width:100%` },
			pair("bug", "Bug report", "when i put the same date in both fields nothing shows up",
				'When the <b>"Start Date"</b> and <b>"End Date"</b> fields have the same date, no results are shown.'),
			pair("commit", "Change or delivery", "fixed the combo that wasnt loading",
				'Fixed the <b>"Supplier"</b> combo not loading, which blocked filtering.'),
			pair("heading", "Title", "Problem where the supplier filter is not loading",
				'<b>"Supplier"</b> filter loads no results'),
			pair("chat", "Message", "morning loryn, did u see the report? theres only 1 more to review",
				"Good morning, Loryn! Did you see the report? There's only one more to review."));
		frame("Text types", "It knows what you're&nbsp;writing.",
			"Bug reports, changes, titles, messages, summaries and prompts. Or pick the kind with <b>Polish text as…</b>", grid);
	},
	markdown() {
		const before = "- [ ] reveiw the [[Test plan]] by friday #qa\n- the endpoint `/api/orders` errors w/ empty filter\n- **importent**: see the [guide](https://obsidian.md)";
		const after = "- [ ] Review the [[Test plan]] by Friday. #qa\n- The endpoint `/api/orders` errors with an empty filter.\n- **Important**: see the [guide](https://obsidian.md).";
		const panel = h("div", { class: "panel", style: `padding:${L ? "18px 20px" : "20px 18px"};width:100%` },
			h("div", { class: "tag" }, "Before"), markdown(before),
			h("div", { style: "height:1px;background:#2e2e2e;margin:16px 0" }),
			h("div", { class: "tag ok", html: ICON.check }, "After"),
			markdown(after, ["Review", "Friday.", "The", "with an", "Important", ")."]));
		const legend = h("div", { class: "chips", style: "margin-top:14px" },
			h("span", { class: "chip" }, h("span", { class: "swatch", style: "background:rgba(139,108,239,.35)" }), "Never sent to the AI"),
			h("span", { class: "chip" }, h("span", { class: "swatch", style: "background:rgba(74,222,128,.3)" }), "Fixed"));
		frame("Markdown", "Your Markdown stays&nbsp;put.",
			"Links, tags, code, URLs and list markers never reach the AI. If one changes, nothing is applied.",
			h("div", { style: "width:100%" }, panel, legend));
	},
};

(async () => {
	await SLIDES[SLIDE]();
	await document.fonts.ready;
	document.body.dataset.ready = "1";
})();
