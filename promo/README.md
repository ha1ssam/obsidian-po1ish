# Imagens de divulgação

`images/` tem 4 imagens, cada uma em duas versões com o mesmo conteúdo (só o layout muda):

- celular (`portrait`): 1080×1920
- desktop (`landscape`): 1800×1200

| # | Imagem | Mostra |
|---|---|---|
| 1 | `menu` | O menu do botão direito com as quatro opções |
| 2 | `preview` | A prévia antes de aplicar (Antes, Depois, Aplicar, Copiar, Tentar de novo) |
| 3 | `types` | Quatro tipos de texto com antes e depois |
| 4 | `markdown` | O Markdown que a IA não vê, destacado |

As janelas não são desenhos: a imagem 2 abre a `PreviewModal` real (`src/modals.ts`) com o `styles.css` do plugin, e a 4 marca o Markdown com o mesmo `toSegments` que o plugin usa (`src/languagetool.ts`). Depois de mudar essas partes, basta gerar de novo.

As imagens são todas em inglês. O plugin fala português, então o `harness.ts` troca os textos fixos da janela (lista `ENGLISH`); se a janela ganhar um texto novo, acrescente a tradução lá.

O logo é desenhado pela função `logo()` de `slides.js`, com a mesma geometria do `assets/icon.png`. Use sempre ela, para a estrela ficar no mesmo lugar em todas as imagens.

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
