// Capítulo 4 — O português previsível
import { h, s, trocar, moldura, botao, seletor, deslizante, leituras, avisoModelo, fmt, fmtInt, fmtPct, grafico, caminho, lerLocal, textoMarcado, reguaSurpresa, intensidade } from "../assets/nucleo/ui.js";
import { K, ALFABETO, codificar, decodificar, normalizar, alinhar, rotulo } from "../assets/nucleo/alfabeto.js";
import { obterModelo, textoTreino, textoTeste, trechos } from "../assets/nucleo/modelo.js";
import { limitesShannon, criarRng } from "../assets/nucleo/info.js";

const HMAX = Math.log2(K); // 5,29 bits: 39 símbolos equiprováveis
const AMOSTRA = 30000; // letras de Memorial de Aires usadas na curva F_N
const F6 = 2.014; // ordem 6, medida em Node nas mesmas 30 mil letras (o modelo compartilhado vai até a ordem 5)
const VOGAIS = new Set("aeiouáàâãéêíóôõú");

export async function montar(raiz) {
  const limpar = [];
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const w = fig.dataset.widget;
    if (w === "gerador") limpar.push(gerador(fig));
    if (w === "curva") limpar.push(curva(fig));
    if (w === "mapa") limpar.push(mapa(fig));
    if (w === "contextos") limpar.push(contextos(fig));
    if (w === "apagadas") limpar.push(apagadas(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// ===========================================================================
// Lógica pura (testada em testes/c4.test.mjs)
// ===========================================================================

/**
 * Modelo de palavras construído aos poucos (gerador: cada `yield` é uma pausa
 * para a página respirar). Não guarda tabelas de pares: para a ordem 2, sorteia
 * uma ocorrência da palavra anterior e copia a palavra seguinte, como Shannon
 * fazia abrindo um livro ao acaso. Memória: dois Uint32Array do tamanho do texto.
 * Devolve { ids, vocab, idDe, inicio, pos, n }:
 *   ids[i]   = número da i-ésima palavra do texto
 *   pos[inicio[v] .. inicio[v+1]) = posições i (com i < n−1) em que a palavra v aparece
 */
export function* construirPalavras(texto, fatia = 60000) {
  const tokens = texto.split(" ").filter(Boolean);
  yield;
  const n = tokens.length;
  const ids = new Uint32Array(n);
  const vocab = [];
  const idDe = new Map();
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    let id = idDe.get(t);
    if (id === undefined) {
      id = vocab.length;
      vocab.push(t);
      idDe.set(t, id);
    }
    ids[i] = id;
    if (i % fatia === fatia - 1) yield;
  }
  const V = vocab.length;
  const inicio = new Uint32Array(V + 1);
  for (let i = 0; i < n - 1; i++) inicio[ids[i] + 1]++;
  for (let v = 0; v < V; v++) inicio[v + 1] += inicio[v];
  yield;
  const pos = new Uint32Array(Math.max(n - 1, 0));
  const cursor = inicio.slice(0, V);
  for (let i = 0; i < n - 1; i++) pos[cursor[ids[i]]++] = i;
  return { ids, vocab, idDe, inicio, pos, n };
}

/** Roda o gerador até o fim, de uma vez (para testes). */
export function construirPalavrasJa(texto) {
  const g = construirPalavras(texto);
  let r;
  do r = g.next();
  while (!r.done);
  return r.value;
}

/**
 * Gera `n` palavras. ordem 1: cada palavra sorteada pela frequência (uma posição
 * ao acaso do texto). ordem 2: uma ocorrência ao acaso da palavra anterior e a
 * palavra que vem depois dela. `inicio` é uma lista de palavras já escritas.
 */
export function gerarPalavras(mp, ordem, n, rng, inicio = []) {
  const out = [];
  let ant = inicio.length ? mp.idDe.get(inicio[inicio.length - 1]) : undefined;
  for (let k = 0; k < n; k++) {
    let id;
    if (ordem >= 2 && ant !== undefined && mp.inicio[ant + 1] > mp.inicio[ant]) {
      const a = mp.inicio[ant], b = mp.inicio[ant + 1];
      id = mp.ids[mp.pos[a + Math.floor(rng() * (b - a))] + 1];
    } else {
      id = mp.ids[Math.floor(rng() * mp.n)];
    }
    out.push(mp.vocab[id]);
    ant = id;
  }
  return out;
}

/** Prefixo digitado pelo leitor, normalizado; mantém o espaço final se ele terminou a palavra. */
export function prefixoNormalizado(bruto) {
  const n = normalizar(bruto ?? "");
  if (!n) return "";
  return /[^\p{L}]$/u.test(bruto) ? n + " " : n;
}

/** Símbolos que podem ser apagados: letras (nunca o espaço); em modo "vogais", só vogais. */
export function apagavel(c, modo) {
  if (c === " ") return false;
  return modo === "vogais" ? VOGAIS.has(c) : true;
}

/**
 * Máscara de letras apagadas (Uint8Array, 1 = apagada) de um texto normalizado.
 * Cada posição apagável recebe uma chave aleatória fixa (pela semente); apagam-se
 * as round(fração·n) de menor chave. Assim, aumentar a fração só acrescenta buracos.
 */
export function mascaraApagadas(texto, fracao, modo, semente) {
  const rng = criarRng(semente);
  const cand = [];
  for (let i = 0; i < texto.length; i++) {
    const r = rng(); // consome sempre, para a chave de cada posição não depender do modo
    if (apagavel(texto[i], modo)) cand.push([r, i]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  const m = new Uint8Array(texto.length);
  const q = Math.round(fracao * cand.length);
  for (let k = 0; k < q; k++) m[cand[k][1]] = 1;
  return m;
}

/**
 * O modelo tenta restaurar as letras apagadas.
 * `cod`: códigos do texto; `mascara[i]` = 1 se a letra i foi apagada; `candidatos`: índices permitidos.
 * Só à esquerda: em cada buraco, da esquerda para a direita, a letra mais provável
 * dado o contexto anterior (com os buracos anteriores já preenchidos).
 * Dos dois lados: parte disso e depois, em duas passadas, troca cada buraco pela
 * letra que maximiza a probabilidade da janela [i, i+ordem] inteira.
 * Devolve um Uint8Array com o texto restaurado.
 */
export function restaurar(m, cod, mascara, { ordem = 5, ambos = true, candidatos, passadas = 2 } = {}) {
  const x = Uint8Array.from(cod);
  const cand = candidatos ?? Array.from({ length: K - 1 }, (_, i) => i + 1);
  const buracos = [];
  for (let i = 0; i < x.length; i++) if (mascara[i]) buracos.push(i);
  for (const i of buracos) {
    const p = m.distribuicao(x, ordem, i);
    let arg = cand[0];
    for (const c of cand) if (p[c] > p[arg]) arg = c;
    x[i] = arg;
  }
  if (!ambos) return x;
  for (let passo = 0; passo < passadas; passo++) {
    for (const i of buracos) {
      const fimJ = Math.min(x.length, i + ordem + 1);
      let melhor = -Infinity, arg = x[i];
      for (const c of cand) {
        x[i] = c;
        let sc = 0;
        for (let j = i; j < fimJ; j++) sc += Math.log(m.prob(x, x[j], ordem, j));
        if (sc > melhor) {
          melhor = sc;
          arg = c;
        }
      }
      x[i] = arg;
    }
  }
  return x;
}

/**
 * Contextos distintos que o modelo viu no treino, por número N de letras de contexto.
 * Usa propriedades internas de ModeloNgramas (ver assets/nucleo/ngramas.js):
 *   m.contextos[o] é uma Tabela com uma chave por contexto de o letras visto no treino;
 *     .n = quantos são, .v0[i] = quantas vezes o contexto da posição i ocorreu.
 *   m.pares[o] tem uma chave por sequência de o+1 letras vista; logo os contextos de
 *     6 letras vistos são as chaves de m.pares[5].
 * Devolve [{ N, possiveis, vistos, unicos }] para N = 1..ordemMax+1.
 */
export function contarContextos(m) {
  const linhas = [];
  const vazio = (t, i) => t.chaves[i] === -1;
  const unicos = (t) => {
    let u = 0;
    for (let i = 0; i < t.cap; i++) if (!vazio(t, i) && t.v0[i] === 1) u++;
    return u;
  };
  for (let N = 1; N <= m.ordemMax + 1; N++) {
    const t = N <= m.ordemMax ? m.contextos[N] : m.pares[m.ordemMax];
    linhas.push({ N, possiveis: K ** N, vistos: t.n, unicos: unicos(t) });
  }
  return linhas;
}

/**
 * Fração das posições de `cod` cujo contexto de N letras nunca apareceu no treino.
 * Os contextos são codificados como no núcleo: Σ (símbolo+1)·40^(o−1), o = 1 (letra mais próxima) … N.
 */
export function fracaoInedita(m, cod, N) {
  const B = 40;
  const ctx = (fim, o) => {
    let c = 0, mult = 1;
    for (let k = 1; k <= o; k++) {
      c += (cod[fim - k] + 1) * mult;
      mult *= B;
    }
    return c;
  };
  let novos = 0, total = 0;
  for (let i = N; i < cod.length; i++) {
    total++;
    if (N <= m.ordemMax) {
      if (m.contextos[N].achar(ctx(i, N)) < 0) novos++;
    } else {
      // N = ordemMax+1: o contexto é a sequência cod[i−N .. i−1], guardada em pares[ordemMax]
      const chave = ctx(i - 1, N - 1) * B + cod[i - 1];
      if (m.pares[m.ordemMax].achar(chave) < 0) novos++;
    }
  }
  return total ? novos / total : 0;
}

/** Surpresa média por tipo de posição: primeira letra de palavra, demais letras, espaços. */
export function surpresaPorPosicao(texto, surpresas) {
  const soma = { inicio: 0, meio: 0, espaco: 0, todas: 0 };
  const n = { inicio: 0, meio: 0, espaco: 0, todas: 0 };
  for (let i = 0; i < texto.length; i++) {
    const tipo = texto[i] === " " ? "espaco" : i === 0 || texto[i - 1] === " " ? "inicio" : "meio";
    soma[tipo] += surpresas[i];
    n[tipo]++;
    soma.todas += surpresas[i];
    n.todas++;
  }
  const media = (t) => (n[t] ? soma[t] / n[t] : NaN);
  return {
    media: media("todas"),
    inicio: media("inicio"),
    meio: media("meio"),
    espaco: media("espaco"),
    fracaoInicio: soma.todas ? soma.inicio / soma.todas : NaN,
  };
}

/** Largura do viewBox: mais estreita em telas pequenas, para o texto do gráfico não encolher demais. */
const larguraGrafico = (el) => ((el.clientWidth || 640) < 520 ? 420 : 640);

/** Rótulo de uma ordem com sinal de menos tipográfico. */
const ordemTxt = (o) => (o < 0 ? "−" + -o : String(o));

/** Executa um gerador em fatias, cedendo a vez à página entre elas. */
function emFatias(gen) {
  return new Promise((resolve, reject) => {
    const passo = () => {
      try {
        const r = gen.next();
        if (r.done) resolve(r.value);
        else setTimeout(passo, 0);
      } catch (e) {
        reject(e);
      }
    };
    passo();
  });
}

let promessaPalavras = null;
function modeloPalavras() {
  if (!promessaPalavras)
    promessaPalavras = textoTreino()
      .then((t) => emFatias(construirPalavras(t)))
      .catch((e) => {
        promessaPalavras = null;
        throw e;
      });
  return promessaPalavras;
}

// ===========================================================================
// 1. O gerador de aproximações (Machado sintético)
// ===========================================================================

const ORDENS = [
  { valor: "-1", rotulo: "−1", desc: "Ordem −1: as 39 letras sorteadas com a mesma probabilidade, sem memória nenhuma." },
  { valor: "0", rotulo: "0", desc: "Ordem 0: cada letra sorteada com a frequência que tem em Machado, sem olhar para as anteriores." },
  { valor: "1", rotulo: "1", desc: "Ordem 1: cada letra sorteada conforme a letra anterior (frequências de pares)." },
  { valor: "2", rotulo: "2", desc: "Ordem 2: cada letra sorteada conforme as duas anteriores (frequências de trincas)." },
  { valor: "3", rotulo: "3", desc: "Ordem 3: conforme as três letras anteriores." },
  { valor: "4", rotulo: "4", desc: "Ordem 4: conforme as quatro letras anteriores." },
  { valor: "5", rotulo: "5", desc: "Ordem 5: conforme as cinco letras anteriores, o máximo que este modelo guarda." },
  { valor: "p1", rotulo: "palavras soltas", desc: "Palavras soltas: cada palavra sorteada com a frequência que tem nos nove romances, sem olhar para a anterior." },
  { valor: "p2", rotulo: "pares de palavras", desc: "Pares de palavras: acha-se ao acaso uma ocorrência da palavra anterior nos romances e copia-se a palavra que vem depois dela." },
];

function gerador(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Machado sintético · aproximações de Shannon",
    legenda: "Escolha quantas letras de memória o gerador tem, ou passe às palavras. A mesma semente produz sempre o mesmo texto; “Sortear de novo” troca a semente. O prefixo, se houver, aparece em azul e o gerador continua a partir dele.",
  });

  let ordem = "3", semente = 1948, escada = false, vez = 0;
  const desc = h("p.c4-desc");
  const saida = h("p.c4-saida", { "aria-live": "polite" });
  const lista = h("ol.c4-escada");
  lista.hidden = true;
  const sel = seletor(
    ORDENS.map((o) => ({ valor: o.valor, rotulo: o.rotulo })),
    ordem,
    (v) => {
      ordem = v;
      gerar();
    },
    { id: "c4-ordem", rotuloAria: "Ordem da aproximação" }
  );
  const prefixo = h("input#c4-prefixo", { type: "text", autocomplete: "off", spellcheck: false, placeholder: "ex.: Capitu", maxlength: 60 });
  const campoSemente = h("input#c4-semente.c4-semente", { type: "number", min: 1, max: 999999, step: 1, value: semente });
  const btSortear = botao("Sortear de novo", () => {
    semente = (semente % 999983) + 1 + Math.floor(Math.random() * 997);
    campoSemente.value = semente;
    gerar();
  }, { variante: "primario", id: "c4-sortear" });
  const btEscada = botao("Mostrar todas as ordens", () => {
    escada = !escada;
    btEscada.textContent = escada ? "Esconder a escada" : "Mostrar todas as ordens";
    gerar();
  }, { variante: "secundario", id: "c4-escada" });

  corpo.append(
    h("div", h("span.c4-rotulo-campo", { id: "c4-ordem-rotulo" }, "Ordem"), sel.el),
    desc,
    saida,
    h(
      "div.c4-campos",
      h("div.c4-campo-prefixo", h("label.c4-rotulo-campo", { for: "c4-prefixo" }, "Começar com (opcional)"), prefixo),
      h("div", h("label.c4-rotulo-campo", { for: "c4-semente" }, "Semente"), campoSemente)
    ),
    h("div.linha", btSortear, btEscada),
    lista
  );
  sel.el.setAttribute("aria-labelledby", "c4-ordem-rotulo");
  avisoModelo(corpo);

  async function texto(o, n, rng, pref) {
    if (o === "p1" || o === "p2") {
      const mp = await modeloPalavras();
      const ini = pref.trim() ? pref.trim().split(" ") : [];
      return gerarPalavras(mp, o === "p1" ? 1 : 2, Math.round(n / 6), rng, ini).join(" ");
    }
    const m = await obterModelo();
    return decodificar(m.gerar(+o, n, rng, codificar(pref)));
  }

  function linhaTexto(pref, gerado, palavras) {
    // o gerador de palavras precisa de um espaço entre o prefixo e a continuação
    const sep = pref && palavras && !pref.endsWith(" ") ? " " : "";
    return [pref ? h("span.c4-prefixo", pref) : null, sep, gerado, "…"];
  }

  async function gerar() {
    const v = ++vez;
    const pref = prefixoNormalizado(prefixo.value);
    const o = ORDENS.find((x) => x.valor === ordem);
    desc.textContent = o.desc;
    if ((ordem === "p1" || ordem === "p2") && !promessaPalavras) saida.textContent = "Separando as palavras dos nove romances…";
    try {
      const t = await texto(ordem, 300, criarRng(semente), pref);
      if (v !== vez) return;
      trocar(saida, linhaTexto(pref, t, ordem[0] === "p"));
      if (escada) {
        const itens = [];
        for (const x of ORDENS) {
          const tx = await texto(x.valor, 120, criarRng(semente), pref);
          if (v !== vez) return;
          itens.push(h("li" + (x.valor === ordem ? ".atual" : ""), h("span.c4-escada-rotulo", x.valor[0] === "p" ? x.rotulo : "ordem " + x.rotulo), h("span.c4-escada-texto", linhaTexto(pref, tx, x.valor[0] === "p"))));
        }
        trocar(lista, itens);
      }
      lista.hidden = !escada;
    } catch {
      if (v === vez) saida.textContent = "Não consegui carregar os romances. Recarregue a página para tentar de novo.";
    }
  }

  let espera;
  prefixo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(gerar, 250);
  });
  campoSemente.addEventListener("change", () => {
    const v = Math.max(1, Math.min(999999, Math.round(+campoSemente.value) || 1));
    campoSemente.value = v;
    semente = v;
    gerar();
  });
  gerar();
  return () => {
    clearTimeout(espera);
    vez++;
  };
}

// ===========================================================================
// 2. A curva F_N, com a faixa do leitor
// ===========================================================================

function curva(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Bits por letra em Memorial de Aires",
    legenda: `Cada ponto é a surpresa média, em bits por letra, do modelo de ordem N lendo ${fmtInt(AMOSTRA)} letras de Memorial de Aires, romance que ele nunca leu. O ponto vazado (ordem 6, só no começo do livro) foi medido à parte, nas mesmas letras, com um modelo maior que o desta página. As faixas horizontais são intervalos: os limites de Shannon do seu jogo e do da máquina no capítulo 1, se houver, e a estimativa de Shannon para o inglês.`,
  });
  const placa = leituras([
    { chave: "amostra", rotulo: "amostra", valor: `${fmtInt(AMOSTRA)} letras` },
    { chave: "f5", rotulo: "ordem 5", valor: "—", destaque: true },
    { chave: "red", rotulo: "redundância (ordem 5)", valor: "—" },
  ]);
  const selTrecho = seletor(
    [
      { valor: 0, rotulo: "começo do livro" },
      { valor: 1, rotulo: "meio" },
      { valor: 2, rotulo: "fim" },
    ],
    0,
    (v) => medir(v),
    { id: "c4-curva-trecho", rotuloAria: "Trecho de Memorial de Aires" }
  );
  const grafo = h("div.c4-grafico");
  const leitor = h("p.c4-leitor");
  corpo.append(h("div.linha", h("span.c4-rotulo-campo", "Medir em"), selTrecho.el), grafo, placa.el, leitor);
  avisoModelo(corpo);

  const rodadas = lerLocal("jogo-shannon", { rodadas: [] })?.rodadas ?? [];
  const voce = rodadas.flatMap((r) => r.voce ?? []);
  const maq = rodadas.flatMap((r) => r.maquina ?? []);
  const lv = voce.length ? limitesShannon(voce, K) : null;
  const lm = maq.length ? limitesShannon(maq, K) : null;
  if (lv) {
    trocar(
      leitor,
      `Você jogou ${rodadas.length} ${rodadas.length === 1 ? "frase" : "frases"} (${fmtInt(voce.length)} letras) no capítulo 1. Pelos limites de Shannon, você leu Machado com algo entre ${fmt(lv.inferior, 2)} e ${fmt(lv.superior, 2)} bits por letra; a máquina, nas mesmas frases, entre ${fmt(lm.inferior, 2)} e ${fmt(lm.superior, 2)}.`,
      voce.length < 300 ? " Com tão poucas letras, a faixa ainda é larga e instável; jogue mais frases para estreitá-la." : ""
    );
  } else {
    trocar(leitor, "Você ainda não jogou o jogo de adivinhação neste navegador. ", h("a", { href: "#c1-jogue" }, "Jogue uma ou duas frases no capítulo 1"), " e volte: sua faixa de bits por letra aparecerá neste gráfico, ao lado da curva da máquina.");
  }

  // faixas (de trás para a frente) e a legenda correspondente, fora do SVG para não se sobreporem
  const FAIXAS = [
    { lim: { inferior: 0.6, superior: 1.3 }, classe: "c4-faixa-shannon", texto: "Shannon, inglês (1951)" },
    { lim: lm, classe: "c4-faixa-maquina", texto: "máquina no jogo do capítulo 1" },
    { lim: lv, classe: "c4-faixa-voce", texto: "você no jogo do capítulo 1" },
  ].filter((f) => f.lim);
  const legenda = h(
    "ul.c4-legenda",
    FAIXAS.slice().reverse().map((f) => h("li", h("span.c4-amostra." + f.classe), `${f.texto}: ${fmt(Math.min(f.lim.inferior, f.lim.superior), 2)} a ${fmt(Math.max(f.lim.inferior, f.lim.superior), 2)} bits por letra`))
  );
  grafo.after(legenda);

  let geracao = 0, timer = null, trechoAtual = 0;

  function desenhar(valores) {
    const g = grafico({
      largura: larguraGrafico(grafo),
      altura: 330,
      margem: { t: 18, r: 18, b: 46, l: 50 },
      x: [-1.5, 6.5],
      y: [0, 6],
      ticksX: [-1, 0, 1, 2, 3, 4, 5, 6],
      ticksY: [0, 1, 2, 3, 4, 5, 6],
      fmtX: (v) => ordemTxt(v),
      fmtY: (v) => String(v),
      rotuloX: "N, letras de contexto (ordem do modelo)",
      rotuloY: "bits por letra",
    });
    const x0 = g.x(-1.5), x1 = g.x(6.5);
    const faixa = (lim, classe, texto) => {
      if (!lim) return;
      const a = Math.min(lim.inferior, lim.superior), b = Math.max(lim.inferior, lim.superior);
      g.plot.append(s("rect", { x: x0, y: g.y(b), width: x1 - x0, height: Math.max(g.y(a) - g.y(b), 1.5), class: classe }, s("title", {}, `${texto}: ${fmt(a, 2)} a ${fmt(b, 2)} bits por letra`)));
    };
    for (const f of FAIXAS) faixa(f.lim, f.classe, f.texto);

    // referência: o máximo do alfabeto
    g.plot.append(
      s("line", { x1: x0, x2: x1, y1: g.y(HMAX), y2: g.y(HMAX), class: "referencia" }),
      s("text", { x: x1 - 6, y: g.y(HMAX) - 6, class: "anotacao", "text-anchor": "end" }, `máximo: log₂ 39 = ${fmt(HMAX, 2)}`)
    );
    const pts = valores.map((v, i) => [g.x(i - 1), g.y(v)]);
    if (pts.length > 1) g.plot.append(s("path", { d: caminho(pts), class: "linha-dados" }));
    if (valores.length === 7 && trechoAtual === 0) {
      g.plot.append(s("path", { d: caminho([pts[6], [g.x(6), g.y(F6)]]), class: "c4-linha-tracejada" }));
      g.plot.append(
        s("circle", { cx: g.x(6), cy: g.y(F6), r: 5, class: "c4-ponto-vazio" }, s("title", {}, `ordem 6: ${fmt(F6, 2)} bits por letra (medido à parte, nas mesmas letras, com um modelo de ordem 6)`)),
        s("text", { x: g.x(6), y: g.y(F6) - 12, class: "anotacao-dados", "text-anchor": "middle" }, fmt(F6, 2))
      );
    }
    pts.forEach(([px, py], i) => {
      g.plot.append(
        s("circle", { cx: px, cy: py, r: 5, class: "ponto" }, s("title", {}, `ordem ${ordemTxt(i - 1)}: ${fmt(valores[i], 2)} bits por letra`)),
        s("text", { x: px + (i === 0 ? 10 : 0), y: py - 12, class: "anotacao-dados", "text-anchor": i === 0 ? "start" : "middle" }, fmt(valores[i], 2))
      );
    });
    g.svg.setAttribute("aria-label", "Bits por letra por ordem do modelo: " + valores.map((v, i) => `ordem ${ordemTxt(i - 1)}, ${fmt(v, 2)}`).join("; "));
    trocar(grafo, g.svg);
  }

  async function medir(qual) {
    const minha = ++geracao;
    trechoAtual = qual;
    clearTimeout(timer);
    desenhar([]);
    placa.definir("f5", "…");
    placa.definir("red", "…");
    let m, teste;
    try {
      [m, teste] = await Promise.all([obterModelo(), textoTeste()]);
    } catch {
      return;
    }
    if (minha !== geracao) return;
    let ini = qual === 0 ? 0 : qual === 1 ? Math.floor((teste.length - AMOSTRA) / 2) : teste.length - AMOSTRA - 1;
    // começa numa palavra inteira
    if (ini > 0) ini = teste.indexOf(" ", ini) + 1;
    const cod = codificar(teste.slice(ini, ini + AMOSTRA));
    const valores = [];
    const passo = (o) => {
      if (minha !== geracao) return;
      valores.push(m.entropiaCruzada(cod, o));
      desenhar(valores);
      if (o < 5) timer = setTimeout(() => passo(o + 1), 30);
      else {
        placa.definir("f5", `${fmt(valores[6], 2)} bits`);
        placa.definir("red", fmtPct(1 - valores[6] / HMAX, 0));
      }
    };
    timer = setTimeout(() => passo(-1), 0);
  }

  medir(0);
  return () => {
    geracao++;
    clearTimeout(timer);
  };
}

// ===========================================================================
// 3. Mapa da surpresa: um trecho pintado em ordens diferentes
// ===========================================================================

const TRECHOS_MAPA = [
  [7, 10],
  [22, 24],
  [33, 36],
];

function mapa(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Mapa da surpresa · Memorial de Aires",
    legenda: "Cada letra é pintada pela surpresa (em bits) que causou ao modelo da ordem escolhida, lendo da esquerda para a direita. Passe o dedo ou o mouse sobre uma letra para ver o valor. Espaços também contam: o fim de uma palavra pode surpreender.",
  });
  let ordem = 1, qual = 0, frases = null, spans = [], cod = null, texto = "";
  const sel = seletor(
    [-1, 0, 1, 2, 3, 4, 5].map((o) => ({ valor: o, rotulo: ordemTxt(o) })),
    ordem,
    (v) => {
      ordem = v;
      pintar();
    },
    { id: "c4-mapa-ordem", rotuloAria: "Ordem do modelo" }
  );
  const caixa = h("div.c4-mapa-texto");
  const placa = leituras([
    { chave: "media", rotulo: "média", valor: "—" },
    { chave: "inicio", rotulo: "1ª letra da palavra", valor: "—", destaque: true },
    { chave: "meio", rotulo: "demais letras", valor: "—" },
    { chave: "espaco", rotulo: "espaços", valor: "—" },
  ]);
  const btOutro = botao("Outro trecho", () => {
    qual = (qual + 1) % TRECHOS_MAPA.length;
    montarTrecho();
  }, { variante: "secundario", id: "c4-mapa-outro" });
  corpo.append(h("div.linha", h("span.c4-rotulo-campo", "Ordem"), sel.el, h("span.c4-empurra", btOutro)), caixa, reguaSurpresa(), placa.el);
  avisoModelo(corpo);

  async function montarTrecho() {
    if (!frases) frases = (await trechos()).frases;
    const [a, b] = TRECHOS_MAPA[qual];
    const original = frases.slice(a, b + 1).map((f) => f.original).join(" ");
    const al = alinhar(original);
    texto = al.normalizado;
    cod = codificar(texto);
    const { el, porPos } = textoMarcado(original, new Float64Array(texto.length));
    spans = porPos;
    trocar(caixa, el);
    pintar();
  }

  async function pintar() {
    if (!cod) return;
    const m = await obterModelo();
    const sp = m.surpresas(cod, ordem);
    sp.forEach((b, j) => {
      const el = spans[j];
      if (!el) return;
      el.style.setProperty("--s", intensidade(b, 10).toFixed(3));
      el.title = `${rotulo(texto[j])}: ${fmt(b, 1)} bits`;
      el.dataset.bits = b.toFixed(2);
    });
    const r = surpresaPorPosicao(texto, sp);
    placa.definir("media", `${fmt(r.media, 2)} bits`);
    placa.definir("inicio", `${fmt(r.inicio, 2)} bits`);
    placa.definir("meio", `${fmt(r.meio, 2)} bits`);
    placa.definir("espaco", `${fmt(r.espaco, 2)} bits`);
  }

  montarTrecho().catch(() => {});
  return () => {};
}

// ===========================================================================
// 4. Contextos possíveis × contextos vistos
// ===========================================================================

const POT10 = { 0: "1", 2: "100", 4: "10 mil", 6: "1 milhão", 8: "100 milhões", 10: "10 bilhões" };

function contextos(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Contextos possíveis e contextos vistos",
    legenda: `Escala logarítmica: cada linha horizontal vale cem vezes a de baixo. “Vistos” conta os contextos distintos que aparecem nos nove romances de treino. A última coluna da tabela usa as mesmas ${fmtInt(AMOSTRA)} letras de Memorial de Aires da curva acima.`,
  });
  const grafo = h("div.c4-grafico");
  const tabela = h("div.rolagem");
  corpo.append(grafo, tabela);
  avisoModelo(corpo);
  let vivo = true;

  (async () => {
    const [m, teste] = await Promise.all([obterModelo(), textoTeste()]);
    // contas espalhadas em vários quadros, para não somar com os outros interativos que acordam junto
    const pausa = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    await pausa(150);
    if (!vivo) return;
    const linhas = contarContextos(m);
    const cod = codificar(teste.slice(0, AMOSTRA));
    for (const l of linhas) {
      await pausa();
      if (!vivo) return;
      l.inedito = fracaoInedita(m, cod, l.N);
    }

    const g = grafico({
      largura: larguraGrafico(grafo),
      altura: 320,
      margem: { t: 18, r: 18, b: 46, l: 92 },
      x: [0.6, 6.4],
      y: [0, 10],
      ticksX: [1, 2, 3, 4, 5, 6],
      ticksY: [0, 2, 4, 6, 8, 10],
      fmtX: String,
      fmtY: (v) => POT10[v] ?? "",
      rotuloX: "N, letras de contexto",
    });
    const lg = Math.log10;
    const corpus = m.n;
    g.plot.append(
      s("line", { x1: g.x(0.6), x2: g.x(6.4), y1: g.y(lg(corpus)), y2: g.y(lg(corpus)), class: "referencia" }),
      s("text", { x: g.x(0.7), y: g.y(lg(corpus)) - 7, class: "anotacao" }, `letras no treino: ${fmtInt(corpus)}`)
    );
    const ptsP = linhas.map((l) => [g.x(l.N), g.y(lg(l.possiveis))]);
    const ptsV = linhas.map((l) => [g.x(l.N), g.y(lg(l.vistos))]);
    g.plot.append(s("path", { d: caminho(ptsP), class: "c4-linha-possiveis" }), s("path", { d: caminho(ptsV), class: "linha-dados" }));
    linhas.forEach((l, i) => {
      g.plot.append(
        s("circle", { cx: ptsP[i][0], cy: ptsP[i][1], r: 4, class: "c4-ponto-possiveis" }, s("title", {}, `${l.N} letras: ${fmtInt(l.possiveis)} contextos possíveis`)),
        s("circle", { cx: ptsV[i][0], cy: ptsV[i][1], r: 4.5, class: "ponto" }, s("title", {}, `${l.N} letras: ${fmtInt(l.vistos)} contextos vistos`))
      );
    });
    const ult = linhas.length - 1;
    g.plot.append(
      s("text", { x: ptsP[ult][0] - 8, y: ptsP[ult][1] + 4, class: "anotacao", "text-anchor": "end" }, "possíveis: 39ᴺ"),
      s("text", { x: ptsV[ult - 1][0], y: ptsV[ult - 1][1] + 26, class: "anotacao", "text-anchor": "middle" }, "vistos no treino")
    );
    g.svg.setAttribute("aria-label", "Contextos possíveis e vistos por número de letras: " + linhas.map((l) => `${l.N} letras, ${fmtInt(l.possiveis)} possíveis e ${fmtInt(l.vistos)} vistos`).join("; "));
    trocar(grafo, g.svg);

    trocar(
      tabela,
      h(
        "table.c4-tabela",
        h("thead", h("tr", h("th", { scope: "col" }, "N"), h("th", { scope: "col" }, "possíveis (39ᴺ)"), h("th", { scope: "col" }, "vistos no treino"), h("th", { scope: "col" }, "fração dos possíveis"), h("th", { scope: "col" }, "vistos uma só vez"), h("th", { scope: "col" }, "posições do teste com contexto inédito"))),
        h(
          "tbody",
          linhas.map((l) =>
            h(
              "tr" + (l.N === 6 ? ".c4-linha-extra" : ""),
              h("th", { scope: "row" }, String(l.N)),
              h("td", fmtInt(l.possiveis)),
              h("td", fmtInt(l.vistos)),
              h("td", porcento(l.vistos / l.possiveis)),
              h("td", fmtPct(l.unicos / l.vistos, 0)),
              h("td", porcento(l.inedito))
            )
          )
        )
      )
    );
  })().catch(() => {});

  return () => {
    vivo = false;
  };
}

/** Porcentagem legível também quando é minúscula. */
function porcento(x) {
  if (x === 0) return "0%";
  if (x >= 0.1) return fmtPct(x, 0);
  if (x >= 0.001) return fmtPct(x, 1);
  return fmtPct(x, 3);
}

// ===========================================================================
// 5. Ler com letras apagadas
// ===========================================================================

function apagadas(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Machado com buracos",
    legenda: "Os espaços entre as palavras nunca são apagados. Tente ler antes de revelar. A máquina usa o modelo de ordem 5 e sabe o mesmo que você: onde estão os buracos e, no modo “só vogais”, que cada buraco é uma vogal.",
  });
  let frases = null, frase = null, semente = 7, modo = "acaso", fracao = 0.3, revelado = false, maquinaVisivel = false, ambos = true;
  const caixa = h("p.c4-buracos", { "aria-live": "polite" });
  const caixaMaq = h("p.c4-buracos.c4-maquina");
  const blocoMaq = h("div.c4-bloco-maquina", h("span.c4-rotulo-campo", "O que a máquina reconstrói"), caixaMaq);
  blocoMaq.hidden = true;
  const placa = leituras([
    { chave: "n", rotulo: "letras apagadas", valor: "—" },
    { chave: "acertos", rotulo: "a máquina acertou", valor: "—", destaque: true },
  ]);
  placa.el.hidden = true;

  const selModo = seletor(
    [
      { valor: "acaso", rotulo: "letras ao acaso" },
      { valor: "vogais", rotulo: "só vogais" },
    ],
    modo,
    (v) => {
      modo = v;
      desenhar();
    },
    { id: "c4-apagar-modo", rotuloAria: "Que letras apagar" }
  );
  const desl = deslizante({
    id: "c4-apagar-fracao",
    rotulo: "fração apagada",
    min: 0,
    max: 1,
    passo: 0.05,
    valor: fracao,
    formato: (v) => fmtPct(v, 0),
    aoMudar: (v) => {
      fracao = v;
      desenhar();
    },
  });
  const selLado = seletor(
    [
      { valor: true, rotulo: "olha para os dois lados" },
      { valor: false, rotulo: "só para trás" },
    ],
    ambos,
    (v) => {
      ambos = v;
      desenhar();
    },
    { id: "c4-apagar-lado", rotuloAria: "Contexto que a máquina usa" }
  );
  const btRevelar = botao("Revelar", () => {
    revelado = !revelado;
    btRevelar.textContent = revelado ? "Esconder de novo" : "Revelar";
    desenhar();
  }, { variante: "primario", id: "c4-revelar" });
  const btMaquina = botao("A máquina tenta", () => {
    maquinaVisivel = !maquinaVisivel;
    btMaquina.textContent = maquinaVisivel ? "Esconder a máquina" : "A máquina tenta";
    desenhar();
  }, { variante: "secundario", id: "c4-maquina" });
  const btOutras = botao("Apagar outras letras", () => {
    semente++;
    desenhar();
  }, { variante: "discreto", id: "c4-outras-letras" });
  const btFrase = botao("Outra frase", () => novaFrase(), { variante: "discreto", id: "c4-outra-frase" });
  selLado.el.hidden = true;

  corpo.append(
    h("div.linha", selModo.el, h("span.c4-empurra", btFrase, btOutras)),
    desl.el,
    caixa,
    h("div.linha", btRevelar, btMaquina, selLado.el),
    blocoMaq,
    placa.el
  );
  avisoModelo(corpo);

  function pintarLinha(alvo, al, mascara, preencher) {
    const filhos = [];
    al.chars.forEach((c, i) => {
      const j = al.mapa[i];
      if (j < 0 || !mascara[j]) {
        filhos.push(c);
        return;
      }
      filhos.push(preencher(c, j));
    });
    trocar(alvo, filhos);
  }

  async function desenhar() {
    if (!frase) return;
    const al = alinhar(frase.original);
    const texto = al.normalizado;
    const mascara = mascaraApagadas(texto, fracao, modo, semente);
    const n = mascara.reduce((a, b) => a + b, 0);
    pintarLinha(caixa, al, mascara, (c) => (revelado ? h("span.c4-revelada", c) : h("span.c4-buraco", { "aria-label": "letra apagada" }, "_")));
    btMaquina.disabled = n === 0;
    selLado.el.hidden = !maquinaVisivel;
    blocoMaq.hidden = !maquinaVisivel;
    placa.el.hidden = !maquinaVisivel;
    placa.definir("n", `${n} de ${[...texto].filter((c) => apagavel(c, modo)).length}`);
    if (!maquinaVisivel) return;
    if (n === 0) {
      trocar(caixaMaq, "Não há buracos para preencher.");
      placa.definir("acertos", "—");
      return;
    }
    const m = await obterModelo();
    const cod = codificar(texto);
    const candidatos = [...ALFABETO].map((c, i) => (apagavel(c, modo) ? i : -1)).filter((i) => i >= 0);
    const rest = restaurar(m, cod, mascara, { ordem: 5, ambos, candidatos });
    let ok = 0;
    pintarLinha(caixaMaq, al, mascara, (c, j) => {
      const palpite = ALFABETO[rest[j]];
      const certo = rest[j] === cod[j];
      if (certo) ok++;
      const mostrado = c !== c.toLowerCase() ? palpite.toUpperCase() : palpite;
      return h("span." + (certo ? "c4-acerto" : "c4-erro"), { title: certo ? "acertou" : `chutou “${palpite}”, era “${texto[j]}”` }, mostrado);
    });
    placa.definir("acertos", `${ok} de ${n} (${fmtPct(ok / n, 0)})`);
  }

  async function novaFrase(indicePreferido) {
    if (!frases) frases = (await trechos()).frases.filter((f) => f.normalizado.length >= 60 && f.normalizado.length <= 140);
    if (indicePreferido != null) frase = frases.find((f) => f.original.startsWith("Rita não tem cultura")) ?? frases[0];
    else {
      let f;
      do f = frases[Math.floor(Math.random() * frases.length)];
      while (f === frase && frases.length > 1);
      frase = f;
    }
    revelado = false;
    btRevelar.textContent = "Revelar";
    desenhar();
  }

  novaFrase(0).catch(() => {});
  return () => {};
}
