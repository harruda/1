# Guia de produção — *A Medida da Surpresa*

Livro interativo, em português do Brasil, de introdução à teoria da informação.
Público: estudante curioso de graduação ou ensino médio avançado, ou adulto culto sem formação em matemática além do ensino médio.
Fio condutor: o jogo de adivinhação de Shannon (1951) e a obra de Machado de Assis como corpus de experimentos.
Tudo roda no navegador, sem build, sem bibliotecas externas.

## Capítulos e fronteiras de assunto

| id | título | cobre | NÃO cobre (é de outro capítulo) |
|----|--------|-------|----------------------------------|
| c1 | O jogo de adivinhação | o jogo; informação = imprevisibilidade; gêmeo idêntico; limites de Shannon usados como caixa-preta | — |
| c2 | Perguntas de sim ou não | bit como resposta a pergunta binária equiprovável; busca binária e log₂ N; por que logaritmo (aditividade; Hartley 1928); surpresa −log₂ p de eventos desiguais; unidades (bit, nat, hartley); código telegráfico de 5 bits (Baudot–Murray/ITA2, a fita perfurada no topo de cada capítulo); Morse como prenúncio de código de comprimento variável | entropia como média (c3); Huffman (c5) |
| c3 | A média da surpresa | entropia H = média da surpresa; distribuições editáveis; entropia binária; 0 ≤ H ≤ log₂ n; letras do português (H₁ de Machado); entropia conjunta, condicional e regra da cadeia com pares de letras; axiomas de Shannon/propriedade de agrupamento | cadeias de Markov e geração de texto (c4); compressão (c5); entropia cruzada/KL (c7) |
| c4 | O português previsível | aproximações de Shannon (ordem 0, 1, 2… letras; palavras) geradas a partir de Machado; cadeias de Markov (Markov 1913, Eugênio Onêguin); entropia condicional F_N caindo com o contexto; esparsidade de dados (contextos nunca vistos, sobreajuste); redundância; ler texto com letras apagadas; comparar com o placar do leitor no c1 | códigos e compressão (c5); redes neurais (c7) |
| c5 | Comprimir é prever | códigos de comprimento fixo e variável; condição de prefixo e árvore; desigualdade de Kraft; Huffman passo a passo; teorema da codificação de fonte (H ≤ L < H+1, blocos); codificação aritmética com o modelo de Machado (intervalo encolhendo; bits ≈ soma das surpresas); comparar ASCII/fixo/Huffman/aritmética/gzip (CompressionStream) num trecho de Memorial de Aires; dados aleatórios não comprimem (contagem/pombos) | canal com ruído (c6); redes neurais (c7) |
| c6 | Conversa no ruído | canal binário simétrico; frase de Machado passando pelo canal; códigos de repetição (taxa × erro); Hamming(7,4) com os três círculos; distância de Hamming; capacidade C = 1 − h(p); teorema do canal ruidoso (taxa < C ⇒ erro → 0); informação mútua; códigos modernos (com cautela histórica); redundância da língua como correção de erros natural | compressão (c5) |
| c7 | Máquinas que adivinham | entropia cruzada, perplexidade, KL; rede neural "Machadinho" no navegador; LLMs; reflexão final | (escrito pelo editor) |

Links entre capítulos: `<a href="#c3">capítulo 3</a>`; para seções: `<a href="#c3-entropia-binaria">`.

## Arquivos de um capítulo

- `capitulos/cN.html` — fragmento (sem `<html>`/`<head>`). Primeira linha: `<link rel="stylesheet" href="capitulos/cN.css">`. Depois um único `<article class="capitulo" data-cap="N">`.
- `capitulos/cN.css` — estilos só deste capítulo. Prefixe classes com algo do capítulo (ex.: `.huff-…`). Use apenas os tokens de cor de `assets/livro.css` (`--papel`, `--papel-2`, `--tinta`, `--tinta-2`, `--regua`, `--sinal`, `--sinal-suave`, `--marca`, `--marca-tinta`, `--ruido`, `--certo`) e de tipo (`--f-titulo`, `--f-texto`, `--f-dados`, `--t-0` … `--t-6`). Nunca cor literal.
- `capitulos/cN.js` — módulo ES que exporta `async function montar(raiz)` e devolve uma função de limpeza (pare timers, listeners globais, animações). Encontra cada `<figure class="widget" data-widget="nome">` no fragmento e monta o interativo.

Modelo completo a imitar: `capitulos/c1.html`, `c1.js`, `c1.css`. **Leia os três antes de começar.**

### Estrutura do HTML

```html
<link rel="stylesheet" href="capitulos/c3.css">
<article class="capitulo" data-cap="3">
  <header class="cap-cabeca">
    <p class="cap-numero">Capítulo 3</p>
    <h1>A média da surpresa</h1>
    <p class="cap-lead">Um parágrafo de abertura.</p>
  </header>
  <section id="c3-algo"> <h2>…</h2> <p>…</p> <aside class="nota">…</aside> <figure class="widget" data-widget="x"></figure> </section>
  …
  <h2 class="exercicios-titulo" id="c3-exercicios">Exercícios</h2>
  <ol class="exercicios"> <li><p>Enunciado <span class="nivel">aquecimento|conceito|cálculo|experimento|reflexão|desafio</span></p>
     <details class="solucao"><summary>Solução</summary><div><p>Solução completa.</p></div></details></li> … </ol>
  <dl class="cartoes-dados"> <dt>pergunta</dt><dd>resposta</dd> … </dl>
</article>
```

Componentes de texto em `livro.css`: `.nota` (nota de margem; vai à direita em tela larga — coloque-a logo após o parágrafo a que se refere), `.destaque-caixa` com `<span class="rotulo">Definição</span>` para definições e teoremas, `.equacao` envolvendo `<math display="block">`, `dfn` na primeira aparição de um termo técnico, `blockquote` com `<footer>` para citações, `.dados` para números/bits inline, `kbd`.

Matemática: **MathML nativo** (`<math>`, `<mi>`, `<mn>`, `<mo>`, `<msub>`, `<mfrac>`, `<munderover>`…). Nada de LaTeX, nada de biblioteca. Use `<mo>⁡</mo>` (U+2061) depois de `log`, e escreva números decimais em português dentro de `<mn>` (`<mn>5,3</mn>`).

### Componentes de interativo (de `livro.css` e `assets/nucleo/ui.js`)

- `moldura(fig, { titulo, legenda })` → `{ corpo }`: aplica a moldura padrão (fundo `--papel-2`, título em versalete mono, legenda embaixo). `corpo` é um flex vertical com `gap`.
- `h("tag.classe#id", attrs, ...filhos)` cria elementos (attrs aceita `on: { click }`, `style: { "--var": … }`); `s(...)` cria SVG; `trocar(el, ...filhos)`.
- `deslizante({ id, rotulo, min, max, passo, valor, formato, aoMudar })`, `botao(texto, f, { variante: "primario"|"secundario"|"discreto" })`, `seletor(opcoes, inicial, aoMudar)`, `leituras([{ chave, rotulo, valor, destaque }])` → `.definir(chave, valor)`.
- Gráficos: `grafico({ largura, altura, x:[a,b], y:[a,b], rotuloX, rotuloY, ticksX, ticksY, fmtX, fmtY })` → `{ svg, plot, x, y }` (escalas); classes SVG prontas: `.linha-dados`, `.area-dados`, `.barra`, `.barra.realce`, `.ponto`, `.referencia`, `.anotacao`, `.anotacao-dados`. `caminho(pts)` gera `d` de polilinha.
- Números: `fmt(x, casas)` (vírgula decimal!), `fmtInt`, `fmtPct`, `fmtBits`. **Nunca** mostre número com ponto decimal ao leitor.
- Marca-texto da surpresa: `textoMarcado(original, surpresas)` e `reguaSurpresa()`. Use sempre amarelo (`--marca`) para surpresa.
- Fita perfurada: `fita(texto)` desenha um texto em ITA2; `baudot(texto)` devolve os códigos de 5 bits.
- `avisoModelo(el)` mostra o progresso do carregamento do modelo de Machado até ele ficar pronto.
- `lerLocal(chave, padrao)` / `guardarLocal(chave, valor)`: memória local à prova de falha. O jogo do c1 guarda em `"jogo-shannon"`: `{ rodadas: [{ frase, voce: [palpites…], maquina: [palpites…] }] }`.
- `semMovimento()`: respeite `prefers-reduced-motion`.
- Classes utilitárias: `.linha` (flex que quebra), `.colunas` (grade responsiva), `.rolagem` (overflow-x), `.bits`, `.bit-trocado`, `.certo`, `.errado`, `.rotulo-campo` (definida em c1.css — se usar, redefina no seu CSS).

### Dados e modelos

- `assets/nucleo/alfabeto.js`: `ALFABETO` (39 símbolos: espaço, a–z, áàâãéêíóôõúç), `K`, `normalizar(texto)`, `normalizarChar`, `alinhar(original)`, `codificar(texto)→Uint8Array`, `decodificar`, `indice(c)`, `rotulo(c)` (espaço → ␣).
- `assets/nucleo/modelo.js`:
  - `obterModelo()` → promessa de `ModeloNgramas` treinado nos nove romances (ordens 0..5; a "ordem" é o número de letras de contexto). Métodos: `distribuicao(hist, ordem, fim?)` (Float64Array de K probabilidades), `prob(hist, s, ordem, fim?)`, `contagens(hist, ordem)` (contagens brutas Uint32Array), `surpresas(codigos, ordem)`, `entropiaCruzada(codigos, ordem)`, `posicaoDoPalpite(hist, s, ordem, fim?)`, `gerar(ordem, n, rng, inicio)` → array de índices. `hist` é array/Uint8Array de índices; `fim` limita o histórico a `hist[0..fim)`. Ordem −1 = uniforme.
  - Medidas no Memorial de Aires (bits/letra) por ordem −1..5: 5,29 · 4,09 · 3,21 · 2,73 · 2,32 · 2,07 · 1,99. Ordem 6 piora (2,02): faltam dados.
  - `textoTreino()` (2,6 milhões de letras normalizadas, nove romances), `textoTeste()` (Memorial de Aires normalizado, 270 mil letras), `trechos()` → `{ fonte, frases: [{ original, normalizado }] }` (1.207 frases de Memorial de Aires com pontuação original).
- `assets/nucleo/info.js`: `surpresa`, `entropia`, `entropiaBinaria`, `entropiaCruzada`, `divergenciaKL`, `frequencias`, `entropiaEmpirica`, `somaKraft`, `huffman(itens)` (com `passos` para animar), `comprimentoMedio`, `intervalosAritmeticos`, `bitsDoIntervalo`, `capacidadeBSC`, `canalBSC`, `repetir`, `maioria`, `hammingCodificar`, `hammingSindrome`, `hammingDecodificar`, `informacaoMutua`, `limitesShannon`, `criarRng(semente)`, `sortear(pesos, rng)`. Testadas em `testes/info.test.mjs`.

**Não altere** nada em `assets/`, `index.html`, nem arquivos de outros capítulos. Se precisar de uma função nova, escreva-a no seu `cN.js` (e, se for lógica pura, teste-a com um `testes/cN.test.mjs` rodando em Node). Se achar um bug no núcleo, descreva-o no seu relatório final.

## Voz e escrita

- Português do Brasil, registro de bom livro de divulgação: claro, direto, caloroso sem ser fofo. Trate o leitor por **você**.
- Frases curtas. Um parágrafo, uma ideia. Prefira o exemplo concreto à abstração; a abstração vem depois do exemplo.
- Evite: travessões para apartes, “não é X, é Y”, frases de efeito com dois-pontos, aspas irônicas, “vale notar”, “curiosamente”, “fascinante”, “mergulhar”, emojis, exclamações. Nada de enchimento.
- Cada capítulo: abertura que dá vontade de ler (um problema, uma cena histórica ou um experimento), desenvolvimento intercalando texto e interativos (o texto **pede** ao leitor que mexa em algo e diz o que observar), fechamento que liga ao próximo capítulo.
- Use Machado de Assis com gosto: exemplos com palavras e frases dele, não com “o rato roeu a roupa”.
- Precisão: todo fato histórico deve ser algo de que você tem certeza. Na dúvida, generalize ("no início dos anos 1950") ou corte. Nada de citações inventadas; se citar, que seja curto e conhecido (e traduzido por você, indicando que é tradução). Datas e nomes conferidos.
- Matemática correta e completa, mas sempre com o porquê em palavras. Toda fórmula importante aparece também em forma de exemplo numérico.
- Tamanho-alvo: 2.500–4.000 palavras de texto corrido por capítulo, 3–5 interativos, 5–7 exercícios com soluções completas (inclua pelo menos um de cálculo à mão e um de experimento com um interativo), 6–8 cartões de revisão (pergunta curta, resposta autossuficiente de 1–3 frases).

## Interativos — padrão de qualidade

- Cada interativo responde a uma pergunta que o texto acabou de fazer. Nada decorativo.
- Abre num estado já interessante (dados carregados, exemplo preenchido). Nunca uma tela vazia.
- Funciona a 390 px de largura (sem rolagem horizontal da página; tabelas/gráficos largos dentro de `.rolagem`), com mouse, toque e teclado. Todo controle tem `id` estável (prefixe com o capítulo: `c3-…`) e rótulo.
- Temas claro e escuro: só tokens. Teste os dois.
- Desempenho: nada que trave a página mais de ~100 ms. Cálculos pesados sobre o corpus inteiro: faça uma vez e guarde, ou use uma amostra (diga qual no texto).
- Animações curtas e com propósito; respeite `semMovimento()`.
- SVG desenhado em escala: rótulos dentro do `viewBox`, cores via classes/tokens.

## Como testar

O servidor local já roda em `http://127.0.0.1:8123` (se não estiver, `npx http-server -p 8123 -c-1 -s .` na raiz, em segundo plano).

```
node ferramentas/olhar.mjs <pasta-de-capturas> cN --esperar=3000 --inteira
node ferramentas/olhar.mjs <pasta-de-capturas> cN --largura=390 --inteira
node ferramentas/olhar.mjs <pasta-de-capturas> cN --tema=dark --inteira
```

O script lista erros do console, falhas de rede e transbordamento horizontal. Capturas de página inteira saem reduzidas; para inspecionar um interativo de perto, escreva um script Playwright curto que role até a `figure` e tire `elementHandle.screenshot()` (veja `ferramentas/olhar.mjs` para o boilerplate: `require("/opt/node22/lib/node_modules/playwright")`). Use uma pasta de capturas sua no diretório temporário, nunca dentro do repositório. Exercite os interativos (clique, arraste) num script e confira o resultado.

Não faça commits nem mexa no git: o editor integra tudo.
