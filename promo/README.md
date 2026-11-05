# Imagens de divulgação

`images/` tem as imagens prontas, cada uma em duas versões:

- vertical: 1080×1920
- horizontal: 1800×1200

| # | Imagem | Mostra |
|---|---|---|
| 1 | `menu` | O menu do botão direito com as quatro opções |
| 2 | `preview` | A prévia antes de aplicar (Antes, Depois, Aplicar, Copiar, Tentar de novo) |
| 3 | `types` | Quatro tipos de texto com antes e depois |
| 4 | `instruction` | "Polir com instrução…" com um pedido e o resultado |
| 5 | `markdown` | O Markdown que a IA não vê, destacado |
| 6 | `engines` | Os motores: servidor do plugin, chave própria, Ollama e LanguageTool |

As janelas não são desenhos: as imagens 2 e 4 abrem a `PreviewModal` e a `RequestModal` reais (`src/modals.ts`) com o `styles.css` do plugin, a 3 usa os nomes de `TEXT_TYPES` (`src/prompt.ts`) e a 5 marca o Markdown com o mesmo `toSegments` que o plugin usa (`src/languagetool.ts`). Depois de mudar essas partes, basta gerar de novo.

## Gerar de novo

Precisa do Edge ou do Chrome instalado (no Windows o Edge já vem) e de internet para as fontes Inter e JetBrains Mono:

```sh
npm run promo                 # todas as imagens
node promo/build.mjs preview  # só uma
```

Se o navegador estiver em outro lugar, defina `BROWSER` com o caminho dele.

## Arquivos

- `slides.js`: o conteúdo e o layout de cada imagem. É aqui que se mudam textos e exemplos.
- `slides.css`: o visual das imagens (fundo, títulos, cards), o mesmo do Checkbox Sty1es.
- `obsidian.css`: as cores e o CSS base do tema escuro do Obsidian (janela, botões, menu).
- `harness.ts`: abre as janelas reais do plugin dentro da página.
- `obsidian-stub.ts`: substitutos mínimos da API do Obsidian (Modal, botões, caixa de texto).
- `build.mjs`: compila o `harness.ts` e tira as fotos com o navegador em modo headless.
