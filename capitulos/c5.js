// Capítulo 5 — Comprimir é prever
import { h, s, trocar, moldura, botao, seletor, deslizante, leituras, avisoModelo, fmt, fmtInt, fmtPct, grafico, caminho, semMovimento } from "../assets/nucleo/ui.js";
import { ALFABETO, K, codificar, decodificar, normalizar, rotulo } from "../assets/nucleo/alfabeto.js";
import { obterModelo, textoTeste, trechos, estado } from "../assets/nucleo/modelo.js";
import { huffman, entropia, entropiaBinaria, frequencias, somaKraft, criarRng } from "../assets/nucleo/info.js";

export async function montar(raiz) {
  const limpar = [];
  const fabricas = { kraft, huffman: huffmanWidget, blocos, aritmetica, comparacao, acaso };
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const f = fabricas[fig.dataset.widget];
    if (f) limpar.push(f(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// ===========================================================================
// Lógica pura (testada em testes/c5.test.mjs)
// ===========================================================================

/**
 * Código de prefixo canônico a partir de uma lista de comprimentos.
 * Distribui as palavras em ordem crescente de comprimento, como assentos numa fileira.
 * Devolve { codigos, soma }: codigos[i] é a palavra do símbolo i, ou null se ela não coube
 * (o que só acontece quando a soma de Kraft passa de 1).
 */
export function codigoCanonico(comps) {
  const n = comps.length;
  const codigos = new Array(n).fill(null);
  const soma = somaKraft(comps);
  if (!n) return { codigos, soma };
  const ordem = comps.map((_, i) => i).sort((a, b) => comps[a] - comps[b] || a - b);
  let valor = 0, anterior = comps[ordem[0]];
  for (const i of ordem) {
    const l = comps[i];
    valor *= 2 ** (l - anterior);
    anterior = l;
    if (valor >= 2 ** l) break; // a árvore encheu: daqui em diante ninguém cabe
    codigos[i] = valor.toString(2).padStart(l, "0");
    valor++;
  }
  return { codigos, soma };
}

/**
 * Árvore binária de um código de prefixo, pronta para desenhar.
 * palavras: [{ simbolo, codigo }]. Cada nó: { prefixo, prof, tipo: "folha"|"interno"|"livre", x, filhos? }.
 * Galhos que nenhuma palavra usa aparecem como nós "livres". x é a posição horizontal (folhas e livres em 0, 1, 2…).
 */
export function arvoreDeCodigos(palavras) {
  const mapa = new Map(palavras.map((p) => [p.codigo, p.simbolo]));
  const nos = [];
  let i = 0;
  function andar(pref) {
    const no = { prefixo: pref, prof: pref.length };
    if (mapa.has(pref)) {
      no.tipo = "folha";
      no.simbolo = mapa.get(pref);
      no.x = i++;
    } else if (palavras.some((p) => p.codigo.length > pref.length && p.codigo.startsWith(pref))) {
      no.tipo = "interno";
      no.filhos = [andar(pref + "0"), andar(pref + "1")];
      no.x = (no.filhos[0].x + no.filhos[1].x) / 2;
    } else {
      no.tipo = "livre";
      no.x = i++;
    }
    nos.push(no);
    return no;
  }
  const raiz = andar("");
  return { raiz, nos, folhas: i, profMax: Math.max(...nos.map((n) => n.prof)) };
}

/**
 * Posições para desenhar uma árvore de Huffman como dendrograma:
 * folhas em 0, 1, 2… na ordem da árvore final; cada nó interno no meio dos filhos,
 * na altura (distância à folha mais funda abaixo dele) — as folhas ficam todas embaixo.
 */
export function posicoesHuffman(raiz) {
  const pos = new Map();
  let i = 0;
  (function andar(no) {
    let p;
    if (no.folha) p = { x: i++, altura: 0 };
    else {
      const a = andar(no.zero), b = andar(no.um);
      p = { x: (a.x + b.x) / 2, altura: 1 + Math.max(a.altura, b.altura) };
    }
    pos.set(no.id, p);
    return p;
  })(raiz);
  return { pos, folhas: i, alturaMax: pos.get(raiz.id).altura };
}

/** Bits por lançamento de um código de Huffman para blocos de k lançamentos de uma moeda com P(cara) = p. */
export function huffmanBlocos(p, k) {
  const itens = [];
  for (let b = 0; b < 2 ** k; b++) {
    let caras = 0;
    for (let x = b; x; x >>= 1) caras += x & 1;
    itens.push({ simbolo: b, peso: p ** caras * (1 - p) ** (k - caras) });
  }
  const { codigos } = huffman(itens);
  let L = 0;
  for (const it of itens) L += it.peso * (codigos.get(it.simbolo)?.length ?? 0);
  return L / k;
}

/**
 * Arredonda uma distribuição para inteiros que somam T, todos ≥ 1
 * (nenhuma letra pode ficar com fatia vazia, senão seria impossível codificá-la).
 */
export function quantizar(p, T = 1 << 16) {
  const n = p.length;
  const f = new Uint32Array(n);
  let soma = 0, imax = 0;
  for (let i = 0; i < n; i++) {
    f[i] = 1 + Math.floor(Math.max(0, p[i]) * (T - n));
    soma += f[i];
    if (p[i] > p[imax]) imax = i;
  }
  let resto = T - soma;
  // o resto (positivo, salvo arredondamento extremo) vai para o símbolo mais provável
  if (resto >= 0) f[imax] += resto;
  else for (let i = 0; resto < 0; i = (i + 1) % n) if (f[i] > 1) (f[i]--, resto++);
  return f;
}

/** Os E dígitos binários de L (inteiro BigInt), com zeros à esquerda. */
const binario = (L, E) => (E ? L.toString(2).padStart(E, "0") : "");

/**
 * Bits decididos: o prefixo binário comum a todos os números do intervalo [L, L+R) / 2^E.
 * É o que um codificador com renormalização já poderia ter enviado.
 */
export function prefixoComum(L, R, E) {
  const a = binario(L, E), b = binario(L + R - 1n, E);
  let i = 0;
  while (i < E && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * A mensagem: a menor sequência de bits b tal que o intervalo diádico
 * [0,b ; 0,b + 2^−|b|) cabe inteiro em [L, L+R) / 2^E.
 */
export function mensagemDoIntervalo(L, R, E) {
  const Eb = BigInt(E);
  const bl = R.toString(2).length;
  for (let m = Math.max(0, E - bl); m <= E; m++) {
    const d = Eb - BigInt(m); // 2^E / 2^m
    const k = (L + (1n << d) - 1n) >> d; // teto de L / 2^d
    if ((k + 1n) << d <= L + R) return m ? k.toString(2).padStart(m, "0") : "";
  }
  return binario(L, E); // inalcançável: com m = E sempre cabe
}

/**
 * Codificação aritmética exata, com inteiros de tamanho arbitrário (BigInt).
 * freqs(hist, i) devolve as frequências (inteiras, somando 2^B) do símbolo i dado hist[0..i).
 * O intervalo depois de i símbolos é [L, L+R) / 2^(B·i).
 * Devolve { bits, custo (Σ log2(2^B / f), a soma das surpresas já arredondadas), passos }.
 * Cada passo: { freqs, simbolo, acum, surpresa, decididos } — o intervalo antes do símbolo é subdividido por freqs.
 */
export function codificarAritmetico(simbolos, freqs, B = 16) {
  const T = 2 ** B, TB = BigInt(T);
  let L = 0n, R = 1n, custo = 0;
  const passos = [];
  for (let i = 0; i < simbolos.length; i++) {
    const f = freqs(simbolos, i);
    const sim = simbolos[i];
    let acum = 0;
    for (let t = 0; t < sim; t++) acum += f[t];
    L = L * TB + R * BigInt(acum);
    R = R * BigInt(f[sim]);
    const surpresa = Math.log2(T / f[sim]);
    custo += surpresa;
    passos.push({ freqs: f, simbolo: sim, acum, surpresa, decididos: prefixoComum(L, R, B * (i + 1)).length });
  }
  const E = B * simbolos.length;
  const bits = mensagemDoIntervalo(L, R, E);
  return { bits, custo, passos, L, R, E, decididos: prefixoComum(L, R, E) };
}

/**
 * Decodificação: recebe só os bits, o número de símbolos e o mesmo modelo freqs(hist, i).
 * Repete as divisões do codificador e, a cada passo, vê em que fatia o número cai.
 */
export function decodificarAritmetico(bits, n, freqs, B = 16) {
  const TB = BigInt(2 ** B);
  const m = bits.length, mb = BigInt(m);
  const V = m ? BigInt("0b" + bits) : 0n; // o número enviado é V / 2^m
  let L = 0n, R = 1n;
  const hist = [];
  for (let i = 0; i < n; i++) {
    const f = freqs(hist, i);
    const E1 = BigInt(B * (i + 1));
    // posição do número dentro do intervalo atual, em unidades de 1/T: piso((V·2^E1/2^m − L·T) / R)
    const t = Number(((V << E1) - ((L * TB) << mb)) / (R << mb));
    let s = 0, acum = 0;
    while (s < f.length - 1 && acum + f[s] <= t) acum += f[s++];
    hist.push(s);
    L = L * TB + R * BigInt(acum);
    R = R * BigInt(f[s]);
  }
  return hist;
}

/** gzip de verdade, pelo navegador. Devolve os bytes comprimidos, ou null se a API não existir. */
export async function gzip(bytes) {
  if (typeof CompressionStream !== "function") return null;
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// ===========================================================================
// Utilidades de interface
// ===========================================================================

// avisoModelo, chamado quando o modelo já está pronto, tenta desligar o ouvinte antes de ele existir;
// por isso só o mostramos enquanto o modelo ainda está sendo treinado.
const aviso = (el) => {
  if (estado.fase !== "pronto") avisoModelo(el);
};

const pausa = () => new Promise((r) => setTimeout(r, 0));
const log2 = Math.log2;

/** Etiqueta de um nó de Huffman: as letras debaixo dele (abreviadas). */
function letrasDe(no) {
  if (no.folha) return rotulo(no.simbolo);
  const t = letrasDe(no.zero) + letrasDe(no.um);
  return t;
}
const abreviar = (t, n = 4) => ([...t].length > n ? [...t].slice(0, n - 1).join("") + "…" : t);

// ===========================================================================
// 1. O orçamento de Kraft
// ===========================================================================
function kraft(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O orçamento de Kraft",
    legenda: ["Escolha o comprimento da palavra-código de cada símbolo. Cada palavra de ℓ bits ocupa a fração 2", h("sup", "−ℓ"), " do orçamento. Se a soma não passa de 1, o código de prefixo existe, e a árvore mostra um deles, com os galhos que sobraram tracejados. Se passa, alguém fica sem lugar."],
  });
  const SIMB = [" ", "a", "e", "o", "s", "r", "i", "m"];
  let comps = [2, 3, 2, 3, 3, 4, 4];

  const lista = h("div.c5-kraft-lista");
  const barra = h("div.c5-kraft-barra");
  const placa = leituras([
    { chave: "soma", rotulo: "soma de Kraft", valor: "—", destaque: true },
    { chave: "veredito", rotulo: "código de prefixo", valor: "—" },
    { chave: "folga", rotulo: "orçamento sem uso", valor: "—" },
  ]);
  const arvore = h("div.rolagem.c5-kraft-arvore");
  const aviso = h("p.c5-aviso", { role: "status" });
  const btMais = botao("+ símbolo", () => {
    if (comps.length < SIMB.length) comps.push(4);
    montarLinhas();
  }, { id: "c5-kraft-mais-simbolo" });
  const btMenos = botao("− símbolo", () => {
    if (comps.length > 2) comps.pop();
    montarLinhas();
  }, { id: "c5-kraft-menos-simbolo" });
  const btPadrao = botao("Voltar ao exemplo", () => {
    comps = [2, 3, 2, 3, 3, 4, 4];
    montarLinhas();
  }, { variante: "discreto", id: "c5-kraft-exemplo" });

  corpo.append(lista, h("div.linha", btMenos, btMais, btPadrao), placa.el, barra, aviso, arvore);

  let linhas = [];
  function montarLinhas() {
    linhas = comps.map((_, i) => {
      const valor = h("output.c5-kraft-l", { "aria-live": "polite" });
      const cod = h("span.bits.c5-kraft-cod");
      const nome = rotulo(SIMB[i]);
      const menos = h("button.botao.c5-mini", { type: "button", id: `c5-kraft-menos-${i}`, "aria-label": `encurtar a palavra de ${nome === "␣" ? "espaço" : nome}`, on: { click: () => mudar(i, -1) } }, "−");
      const mais = h("button.botao.c5-mini", { type: "button", id: `c5-kraft-mais-${i}`, "aria-label": `alongar a palavra de ${nome === "␣" ? "espaço" : nome}`, on: { click: () => mudar(i, +1) } }, "+");
      const el = h("div.c5-kraft-linha", h("span.c5-simbolo", nome), menos, valor, mais, cod);
      return { el, valor, cod, menos, mais };
    });
    trocar(lista, linhas.map((l) => l.el));
    btMais.disabled = comps.length >= SIMB.length;
    btMenos.disabled = comps.length <= 2;
    desenhar();
  }
  function mudar(i, d) {
    comps[i] = Math.min(7, Math.max(1, comps[i] + d));
    desenhar();
  }

  function desenhar() {
    const { codigos, soma } = codigoCanonico(comps);
    const lmax = Math.max(...comps), den = 2 ** lmax;
    const num = comps.reduce((a, l) => a + 2 ** (lmax - l), 0);
    let g = num, d = den;
    while (g % 2 === 0 && d > 1) (g /= 2), (d /= 2);
    placa.definir("soma", d === 1 ? String(g) : `${g}/${d} = ${fmt(soma, soma < 10 ? 4 : 2).replace(/0+$/, "").replace(/,$/, "")}`);
    const cabe = soma <= 1 + 1e-12;
    placa.definir("veredito", cabe ? "existe" : "não existe");
    placa.definir("folga", cabe ? fmtPct(1 - soma, 1) : "estourou");
    comps.forEach((l, i) => {
      const ln = linhas[i];
      ln.valor.textContent = `${l} ${l === 1 ? "bit" : "bits"}`;
      ln.menos.disabled = l <= 1;
      ln.mais.disabled = l >= 7;
      ln.cod.textContent = codigos[i] ?? "sem lugar";
      ln.el.classList.toggle("c5-sem-lugar", !codigos[i]);
    });
    desenharBarra(soma);
    if (cabe) {
      aviso.textContent = soma < 1 - 1e-12 ? "Cabe, e ainda sobra espaço: a árvore tem galhos sem uso. Dá para encurtar alguma palavra sem prejudicar nenhuma outra." : "Cabe exatamente: a árvore está cheia, todo galho termina numa letra.";
      aviso.className = "c5-aviso";
    } else {
      const fora = comps.map((_, i) => i).filter((i) => !codigos[i]).map((i) => `“${rotulo(SIMB[i])}”`);
      aviso.textContent = `A soma passa de 1. Não há como pendurar todas essas folhas numa árvore binária: ${fora.join(", ")} ${fora.length > 1 ? "ficaram" : "ficou"} sem lugar. Alongue alguma palavra.`;
      aviso.className = "c5-aviso errado";
    }
    const palavras = comps.map((_, i) => ({ simbolo: SIMB[i], codigo: codigos[i] })).filter((p) => p.codigo);
    desenharArvore(palavras);
  }

  function desenharBarra(soma) {
    const W = 420, H = 58, x0 = 8, larg = W - 16;
    const escalaMax = Math.max(1, soma);
    const X = (v) => x0 + (v / escalaMax) * larg;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "c5-svg", role: "img", "aria-label": `Orçamento de Kraft: soma ${fmt(soma, 3)} de 1` });
    svg.append(s("rect", { x: X(0), y: 8, width: X(1) - X(0), height: 26, class: "c5-orcamento" }));
    const ordem = comps.map((_, i) => i).sort((a, b) => comps[a] - comps[b] || a - b);
    let acc = 0;
    for (const i of ordem) {
      const w = 2 ** -comps[i];
      const a = acc, b = acc + w;
      acc = b;
      // parte dentro do orçamento e parte que estoura
      if (a < 1) svg.append(s("rect", { x: X(a), y: 8, width: X(Math.min(b, 1)) - X(a), height: 26, class: "c5-pedaco" }));
      if (b > 1) svg.append(s("rect", { x: X(Math.max(a, 1)), y: 8, width: X(b) - X(Math.max(a, 1)), height: 26, class: "c5-pedaco c5-estouro" }));
      if (X(b) - X(a) >= 14) svg.append(s("text", { x: (X(a) + X(b)) / 2, y: 25, class: "c5-rotulo-svg", "text-anchor": "middle" }, rotulo(SIMB[i])));
    }
    svg.append(
      s("line", { x1: X(1), x2: X(1), y1: 2, y2: 40, class: "c5-marco" }),
      s("text", { x: X(0), y: 52, class: "c5-tick" }, "0"),
      s("text", { x: X(1), y: 52, class: "c5-tick", "text-anchor": soma > 1.05 ? "middle" : "end" }, "1")
    );
    trocar(barra, svg);
  }

  function desenharArvore(palavras) {
    const { nos, folhas, profMax } = arvoreDeCodigos(palavras);
    const dx = 46, dy = 46, mx = 26, topo = 18;
    const W = Math.max(300, mx * 2 + (folhas - 1) * dx), H = topo + profMax * dy + 44;
    const off = (W - (mx * 2 + (folhas - 1) * dx)) / 2;
    const X = (x) => off + mx + x * dx, Y = (p) => topo + p * dy;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "c5-svg c5-arvore", style: `max-width:${W}px`, role: "img", "aria-label": "Árvore do código" });
    const gA = s("g"), gN = s("g");
    for (const no of nos) {
      if (no.tipo === "interno")
        no.filhos.forEach((f, b) => {
          gA.append(s("line", { x1: X(no.x), y1: Y(no.prof), x2: X(f.x), y2: Y(f.prof), class: f.tipo === "livre" ? "c5-aresta c5-tracejada" : "c5-aresta" }));
          gA.append(s("text", { x: (X(no.x) + X(f.x)) / 2 + (b ? 7 : -7), y: (Y(no.prof) + Y(f.prof)) / 2, class: "c5-bit-aresta", "text-anchor": "middle" }, String(b)));
        });
      if (no.tipo === "interno") gN.append(s("circle", { cx: X(no.x), cy: Y(no.prof), r: 4, class: "c5-no" }));
      else if (no.tipo === "folha") {
        gN.append(
          s("circle", { cx: X(no.x), cy: Y(no.prof), r: 12, class: "c5-folha" }),
          s("text", { x: X(no.x), y: Y(no.prof) + 4.5, class: "c5-rotulo-folha", "text-anchor": "middle" }, rotulo(no.simbolo)),
          s("text", { x: X(no.x), y: Y(no.prof) + 27, class: "c5-cod-folha", "text-anchor": "middle" }, no.prefixo)
        );
      } else {
        gN.append(
          s("circle", { cx: X(no.x), cy: Y(no.prof), r: 9, class: "c5-livre" }),
          s("text", { x: X(no.x), y: Y(no.prof) + 24, class: "c5-cod-folha c5-cod-livre", "text-anchor": "middle" }, no.prefixo || "vazio")
        );
      }
    }
    svg.append(gA, gN);
    trocar(arvore, svg);
  }

  montarLinhas();
  return () => {};
}

// ===========================================================================
// 2. Huffman passo a passo
// ===========================================================================
function huffmanWidget(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O algoritmo de Huffman",
    legenda: "Cada símbolo começa como uma árvore de um nó só, com o número de vezes que aparece no texto. A cada passo, as duas árvores de menor peso (destacadas na fila) viram galhos de um nó novo. Sobe 0 à esquerda e 1 à direita: o caminho da raiz até a folha é o código da letra.",
  });
  const PADRAO = "Ora bem, faz hoje um ano que voltei definitivamente da Europa.";
  const entrada = h("textarea#c5-huff-texto", { rows: 2, "aria-label": "Texto a codificar", spellcheck: false });
  entrada.value = PADRAO;
  const status = h("p.c5-status", { role: "status" });
  const fila = h("div.c5-fila", { "aria-label": "Fila de árvores, da mais leve para a mais pesada" });
  const arvore = h("div.rolagem.c5-huff-arvore");
  const placa = leituras([
    { chave: "letras", rotulo: "letras", valor: "—" },
    { chave: "bits", rotulo: "bits com Huffman", valor: "—" },
    { chave: "L", rotulo: "L · bits por letra", valor: "—", destaque: true },
    { chave: "H", rotulo: "H · entropia", valor: "—" },
    { chave: "fixo", rotulo: "fixo, só estas letras", valor: "—" },
  ]);
  const tabela = h("div.c5-tabela");
  const codificado = h("div.c5-codificado");
  const btInicio = botao("⏮ Recomeçar", () => ir(0), { id: "c5-huff-inicio" });
  const btVoltar = botao("◀ Passo", () => ir(k - 1), { id: "c5-huff-voltar" });
  const btAvancar = botao("Passo ▶", () => ir(k + 1), { id: "c5-huff-avancar" });
  const btAnimar = botao("Animar", () => alternarAnimacao(), { variante: "primario", id: "c5-huff-animar" });
  const btFim = botao("Fim ⏭", () => ir(S), { id: "c5-huff-fim" });

  corpo.append(
    h("div", h("label.c5-rotulo-campo", { for: "c5-huff-texto" }, "Texto (só as 39 letras do livro contam)"), entrada),
    h("div.linha", btAnimar, btInicio, btVoltar, btAvancar, btFim),
    status,
    h("div", h("span.c5-rotulo-campo", "Fila (da mais leve para a mais pesada)"), fila),
    arvore,
    placa.el,
    h("div", h("span.c5-rotulo-campo", "O código"), tabela),
    h("div", h("span.c5-rotulo-campo", "O texto codificado"), codificado)
  );

  let texto = "", res = null, layout = null, S = 0, k = 0, passoDe = new Map(), paiDe = new Map(), elems = new Map(), animacao = null;

  function preparar() {
    pararAnimacao();
    texto = normalizar(entrada.value).slice(0, 4000);
    const f = frequencias(texto);
    const itens = [...f].sort((a, b) => b[1] - a[1] || ALFABETO.indexOf(a[0]) - ALFABETO.indexOf(b[0])).map(([simbolo, peso]) => ({ simbolo, peso }));
    if (itens.length < 2) {
      res = null;
      status.textContent = "Digite um texto com pelo menos duas letras diferentes.";
      [fila, arvore, tabela, codificado].forEach((e) => trocar(e));
      ["letras", "bits", "L", "H", "fixo"].forEach((c) => placa.definir(c, "—"));
      [btInicio, btVoltar, btAvancar, btAnimar, btFim].forEach((b) => (b.disabled = true));
      return;
    }
    [btInicio, btVoltar, btAvancar, btAnimar, btFim].forEach((b) => (b.disabled = false));
    res = huffman(itens);
    S = res.passos.length;
    passoDe = new Map(res.passos.map((p, j) => [p.novo.id, j]));
    paiDe = new Map();
    res.passos.forEach((p, j) => {
      paiDe.set(p.a.id, j);
      paiDe.set(p.b.id, j);
    });
    layout = posicoesHuffman(res.raiz);
    montarArvore();
    montarResultados(itens);
    ir(0);
  }

  function montarArvore() {
    const { pos, folhas, alturaMax } = layout;
    const dx = Math.max(26, Math.min(40, 620 / Math.max(1, folhas - 1))), dy = 36, mx = 18, topo = 18;
    const W = mx * 2 + (folhas - 1) * dx, H = topo + alturaMax * dy + 46;
    const X = (x) => mx + x * dx, Y = (a) => topo + (alturaMax - a) * dy;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "c5-svg c5-huff-svg", style: `min-width:${Math.min(W, 560)}px;max-width:${W}px`, role: "img", "aria-label": "Árvore de Huffman em construção" });
    const gA = s("g"), gN = s("g");
    elems = new Map();
    const nos = [];
    (function coletar(no) {
      nos.push(no);
      if (!no.folha) (coletar(no.zero), coletar(no.um));
    })(res.raiz);
    for (const no of nos) {
      const p = pos.get(no.id);
      const x = X(p.x), y = Y(p.altura);
      const grupo = s("g", { class: "c5-hno" });
      let arestas = null;
      if (no.folha) {
        grupo.append(
          s("rect", { x: x - 11, y: y - 11, width: 22, height: 22, rx: 3, class: "c5-hfolha" }),
          s("text", { x, y: y + 4.5, class: "c5-rotulo-folha", "text-anchor": "middle" }, rotulo(no.simbolo)),
          s("text", { x, y: y + 26, class: "c5-cod-folha", "text-anchor": "middle" }, String(no.peso))
        );
      } else {
        arestas = s("g", { class: "c5-harestas" });
        [no.zero, no.um].forEach((f, b) => {
          const pf = pos.get(f.id);
          const xf = X(pf.x), yf = Y(pf.altura) - (f.folha ? 11 : 9);
          arestas.append(
            s("path", { d: `M${x} ${y}H${xf}V${yf}`, class: "c5-aresta" }),
            s("text", { x: xf + (b ? 4 : -4), y: y + 11, class: "c5-bit-aresta", "text-anchor": b ? "start" : "end" }, String(b))
          );
        });
        const peso = String(no.peso);
        grupo.append(
          s("circle", { cx: x, cy: y, r: peso.length > 2 ? 12 : 9.5, class: "c5-hinterno" }),
          s("text", { x, y: y + 3.5, class: "c5-peso-no", "text-anchor": "middle" }, peso)
        );
        gA.append(arestas);
      }
      gN.append(grupo);
      elems.set(no.id, { no, grupo, arestas });
    }
    svg.append(gA, gN);
    trocar(arvore, svg);
  }

  function montarResultados(itens) {
    const { codigos } = res;
    const n = texto.length;
    let total = 0;
    for (const c of texto) total += codigos.get(c).length;
    const probs = itens.map((x) => x.peso / n);
    const H = entropia(probs);
    placa.definir("letras", fmtInt(n));
    placa.definir("bits", fmtInt(total));
    placa.definir("L", fmt(total / n, 2));
    placa.definir("H", fmt(H, 2));
    placa.definir("fixo", `${Math.ceil(log2(itens.length))} bits`);
    trocar(
      tabela,
      itens.map((it) => h("div.c5-celula", h("span.c5-celula-letra", rotulo(it.simbolo)), h("span.c5-celula-n", "×" + it.peso), h("span.bits.c5-celula-cod", codigos.get(it.simbolo))))
    );
    const MAX = 160;
    const pares = [...texto.slice(0, MAX)].map((c, i) =>
      h("span.c5-par" + (i % 2 ? ".c5-impar" : ""), h("span.c5-par-letra", c === " " ? "␣" : c), h("span.bits.c5-par-bits", codigos.get(c)))
    );
    trocar(codificado, pares, texto.length > MAX ? h("span.c5-mais", `… e mais ${fmtInt(texto.length - MAX)} letras`) : null);
  }

  function ir(novo) {
    if (!res) return;
    k = Math.max(0, Math.min(S, novo));
    // nós visíveis e raízes atuais da floresta
    const raizes = [];
    for (const { no, grupo, arestas } of elems.values()) {
      const visivel = no.folha || passoDe.get(no.id) < k;
      const raiz = visivel && !(paiDe.has(no.id) && paiDe.get(no.id) < k);
      grupo.classList.toggle("c5-oculto", !visivel);
      arestas?.classList.toggle("c5-oculto", !visivel);
      grupo.classList.toggle("c5-raiz", raiz && S > 0);
      grupo.classList.toggle("c5-novo", !no.folha && passoDe.get(no.id) === k - 1);
      grupo.classList.remove("c5-proximo");
      if (raiz) raizes.push(no);
    }
    raizes.sort((a, b) => a.peso - b.peso || a.id - b.id);
    if (k < S) for (const no of raizes.slice(0, 2)) elems.get(no.id).grupo.classList.add("c5-proximo");
    trocar(
      fila,
      raizes.map((no, i) =>
        h("span.c5-ficha" + (k < S && i < 2 ? ".c5-ficha-proxima" : ""), h("span.c5-ficha-letras", abreviar(letrasDe(no))), h("span.c5-ficha-peso", String(no.peso)))
      )
    );
    if (k === 0) status.textContent = `${S + 1} símbolos, ${S + 1} árvores de um nó só. Faltam ${S} fusões. Aperte Animar ou Passo.`;
    else if (k < S) {
      const p = res.passos[k - 1];
      status.textContent = `Passo ${k} de ${S}: “${abreviar(letrasDe(p.a), 6)}” (${p.a.peso}) e “${abreviar(letrasDe(p.b), 6)}” (${p.b.peso}) viram um nó de peso ${p.novo.peso}. Próximos: os dois destacados.`;
    } else status.textContent = `Pronto: ${S} fusões e sobrou uma árvore só, de peso ${res.raiz.peso}, o total de letras. Siga da raiz até cada folha para ler o código.`;
    btVoltar.disabled = k === 0;
    btInicio.disabled = k === 0;
    btAvancar.disabled = k === S;
    btFim.disabled = k === S;
  }

  function pararAnimacao() {
    clearInterval(animacao);
    animacao = null;
    btAnimar.textContent = "Animar";
  }
  function alternarAnimacao() {
    if (animacao) return pararAnimacao();
    if (semMovimento()) return ir(S);
    if (k >= S) ir(0);
    btAnimar.textContent = "Pausar";
    animacao = setInterval(() => {
      ir(k + 1);
      if (k >= S) pararAnimacao();
    }, Math.max(260, Math.min(700, 9000 / Math.max(1, S))));
  }

  let espera;
  entrada.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(preparar, 300);
  });
  preparar();
  return () => {
    pararAnimacao();
    clearTimeout(espera);
  };
}

// ===========================================================================
// 3. Moeda viciada em blocos
// ===========================================================================
function blocos(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Huffman em blocos · moeda viciada",
    legenda: "Pontos: bits por lançamento de um código de Huffman que codifica k lançamentos de cada vez. Linha tracejada: a entropia h(p). Faixa: onde o teorema garante que o melhor código de blocos de tamanho k está, entre h(p) e h(p) + 1/k.",
  });
  const KMAX = 8;
  const graf = h("div.c5-grafico");
  const placa = leituras([
    { chave: "h", rotulo: "entropia h(p)", valor: "—", destaque: true },
    { chave: "k1", rotulo: "k = 1", valor: "—" },
    { chave: "k2", rotulo: "k = 2", valor: "—" },
    { chave: "k8", rotulo: "k = 8", valor: "—" },
  ]);
  const exemplo = h("p.c5-exemplo");
  const desl = deslizante({ id: "c5-blocos-p", rotulo: "probabilidade de cara", min: 0.01, max: 0.5, passo: 0.01, valor: 0.1, formato: (v) => fmt(v, 2), aoMudar: desenhar });
  corpo.append(desl.el, graf, placa.el, exemplo);

  function desenhar(p = desl.valor()) {
    const hp = entropiaBinaria(p);
    const Ls = [];
    for (let k = 1; k <= KMAX; k++) Ls.push(huffmanBlocos(p, k));
    const g = grafico({ largura: 640, altura: 300, margem: { t: 16, r: 16, b: 44, l: 66 }, x: [0.5, KMAX + 0.5], y: [0, 1.1], ticksX: [1, 2, 3, 4, 5, 6, 7, 8], ticksY: [0, 0.25, 0.5, 0.75, 1], fmtX: (v) => String(v), fmtY: (v) => fmt(v, 2), rotuloX: "k, lançamentos codificados juntos", rotuloY: "bits por lançamento" });
    const faixa = [];
    for (let k = 1; k <= KMAX; k++) faixa.push([g.x(k), g.y(Math.min(1.1, hp + 1 / k))]);
    for (let k = KMAX; k >= 1; k--) faixa.push([g.x(k), g.y(hp)]);
    g.plot.append(
      s("path", { d: caminho(faixa) + "Z", class: "area-dados" }),
      s("line", { x1: g.x(0.5), x2: g.x(KMAX + 0.5), y1: g.y(hp), y2: g.y(hp), class: "referencia" }),
      s("text", { x: g.x(KMAX + 0.45), y: g.y(hp) + 16, class: "anotacao", "text-anchor": "end" }, `h(p) = ${fmt(hp, 3)}`),
      s("path", { d: caminho(Ls.map((L, i) => [g.x(i + 1), g.y(L)])), class: "linha-dados" })
    );
    Ls.forEach((L, i) =>
      g.plot.append(
        s("circle", { cx: g.x(i + 1), cy: g.y(L), r: 4.5, class: "ponto" }, s("title", {}, `k = ${i + 1}: ${fmt(L, 3)} bits por lançamento`)),
        s("text", { x: g.x(i + 1) + (i < KMAX - 1 ? 7 : 0), y: g.y(L) - 9, class: "anotacao-dados", "text-anchor": i < KMAX - 1 ? "start" : "middle" }, fmt(L, 3))
      )
    );
    trocar(graf, g.svg);
    placa.definir("h", fmt(hp, 3));
    placa.definir("k1", fmt(Ls[0], 3));
    placa.definir("k2", fmt(Ls[1], 3));
    placa.definir("k8", fmt(Ls[7], 3));
    // o código de blocos de 2, por extenso (● cara, ○ coroa)
    const nomes = ["○○", "○●", "●○", "●●"];
    const itens = [0, 1, 2, 3].map((b) => ({ simbolo: b, peso: (b & 1 ? p : 1 - p) * (b & 2 ? p : 1 - p) }));
    const { codigos } = huffman(itens);
    trocar(
      exemplo,
      h("span.c5-rotulo-campo", "Código de Huffman para blocos de 2 (● cara, ○ coroa)"),
      h("span.c5-blocos-cod", itens.map((it) => h("span.c5-ficha", h("span.c5-ficha-letras", nomes[it.simbolo]), h("span.c5-ficha-peso", fmt(it.peso, 4)), h("span.bits", "→ " + codigos.get(it.simbolo)))))
    );
  }
  desenhar();
  return () => {};
}

// ===========================================================================
// 4. Codificação aritmética com o modelo de Machado
// ===========================================================================
function aritmetica(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Codificação aritmética · modelo de Machado",
    legenda: "Cada faixa é o intervalo atual, ampliado até ocupar a largura toda e dividido em fatias proporcionais às probabilidades que o modelo dá à próxima letra. A fatia da letra que de fato veio (em amarelo) vira a faixa de baixo. As contas são exatas, com inteiros de tamanho arbitrário; as probabilidades são arredondadas para múltiplos de 1/65.536.",
  });
  const PADRAO = "os mortos podem muito bem combater os vivos";
  const B = 16, T = 2 ** B, LINHAS = 6, MAXLETRAS = 240;
  const entrada = h("textarea#c5-arit-texto", { rows: 2, "aria-label": "Frase a codificar", spellcheck: false });
  entrada.value = PADRAO;
  let ordem = 5;
  const ORDENS = [-1, 0, 1, 2, 3, 4, 5];
  const sel = seletor(ORDENS.map((o) => ({ valor: o, rotulo: o < 0 ? "sem modelo" : `ordem ${o}` })), ordem, (o) => {
    ordem = o;
    recalcular();
  }, { id: "c5-arit-ordem", rotuloAria: "Ordem do modelo (letras de contexto)" });
  const btOutra = botao("Outra frase de Machado", () => outraFrase(), { variante: "discreto", id: "c5-arit-outra" });
  const btVoltar = botao("◀ Letra", () => ir(n - 1), { id: "c5-arit-voltar" });
  const btAvancar = botao("Letra ▶", () => ir(n + 1), { variante: "primario", id: "c5-arit-avancar" });
  const btFim = botao("Até o fim ⏭", () => ir(N), { id: "c5-arit-fim" });
  const btInicio = botao("⏮", () => ir(0), { id: "c5-arit-inicio", titulo: "Voltar ao começo" });
  btInicio.setAttribute("aria-label", "Voltar ao começo");
  const vista = h("div.c5-arit-vista");
  const placa = leituras([
    { chave: "n", rotulo: "letras codificadas", valor: "—" },
    { chave: "S", rotulo: "soma das surpresas", valor: "—", destaque: true },
    { chave: "dec", rotulo: "bits já decididos", valor: "—" },
    { chave: "msg", rotulo: "mensagem final", valor: "—" },
  ]);
  const rotuloBits = h("span.c5-rotulo-campo");
  const linhaBits = h("p.bits.c5-arit-bits");
  const comparar = h("p.c5-exemplo");
  const saida = h("p.c5-arit-saida", { "aria-live": "polite" });
  const btDec = botao("Decodificar com o mesmo modelo", () => decodificar_("mesmo"), { variante: "primario", id: "c5-arit-decodificar" });
  const btOutro = botao("…com outro modelo", () => decodificar_("outro"), { id: "c5-arit-outro-modelo" });
  const btBit = botao("Trocar um bit e decodificar", () => decodificar_("bit"), { id: "c5-arit-trocar-bit" });
  const explica = h("p.c5-status");

  corpo.append(
    h("div", h("label.c5-rotulo-campo", { for: "c5-arit-texto" }, "Frase"), entrada),
    h("div.linha", sel.el, btOutra),
    h("div.linha", btInicio, btVoltar, btAvancar, btFim),
    vista,
    placa.el,
    h("div", rotuloBits, linhaBits),
    comparar,
    h("div.c5-arit-decod", h("span.c5-rotulo-campo", "O gêmeo idêntico: o decodificador recebe só os bits e o número de letras"), h("div.linha", btDec, btOutro, btBit), explica, saida)
  );
  aviso(corpo);

  let modelo = null, cod = new Uint8Array(0), res = null, n = 0, N = 0, anim = null, vivo = true, larguraDesenhada = 0;
  const observador = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (res && Math.abs(vista.clientWidth - larguraDesenhada) > 24 && (vista.clientWidth < 680 || larguraDesenhada < 680)) desenharVista();
  }) : null;
  observador?.observe(vista);

  const freqsCom = (o) => (hist, i) => quantizar(modelo.distribuicao(hist, o, i), T);

  async function recalcular() {
    modelo = await obterModelo();
    if (!vivo) return;
    pararDec();
    const texto = normalizar(entrada.value).slice(0, MAXLETRAS);
    cod = codificar(texto);
    N = cod.length;
    res = codificarAritmetico(cod, freqsCom(ordem), B);
    const outro = ordem >= 3 ? 1 : 5;
    btOutro.textContent = `…com outro modelo (${outro < 0 ? "sem modelo" : "ordem " + outro})`;
    saida.textContent = "";
    explica.textContent = "";
    const fixo = 6 * N, igual = N * log2(K);
    comparar.textContent = N
      ? `Para comparar: ${fmtInt(N)} letras num código fixo de 6 bits custam ${fmtInt(fixo)} bits; com todas as letras igualmente prováveis, ${fmt(igual, 1)} bits. Com este modelo, a mensagem tem ${fmtInt(res.bits.length)} bits, ${fmt(res.bits.length / N, 2)} por letra.`
      : "";
    ir(Math.min(n || 6, N));
  }

  function ir(novo) {
    if (!res) return;
    n = Math.max(0, Math.min(N, novo));
    btVoltar.disabled = btInicio.disabled = n === 0;
    btAvancar.disabled = btFim.disabled = n === N;
    const custo = res.passos.slice(0, n).reduce((a, p) => a + p.surpresa, 0);
    placa.definir("n", `${n} de ${N}`);
    placa.definir("S", `${fmt(custo, 1)} bits`);
    const dec = n ? res.passos[n - 1].decididos : 0;
    placa.definir("dec", String(dec));
    placa.definir("msg", n === N ? `${res.bits.length} bits` : "—");
    if (n === N) {
      rotuloBits.textContent = `Mensagem final: ${res.bits.length} bits (a soma das surpresas era ${fmt(res.custo, 1)})`;
      linhaBits.textContent = res.bits || "(vazia)";
    } else {
      rotuloBits.textContent = "Bits já decididos: o começo e o fim do intervalo concordam neles";
      linhaBits.textContent = (n ? res.decididos.slice(0, dec) : "") + "…";
    }
    desenharVista();
  }

  function desenharVista() {
    // a largura do desenho acompanha a da tela, para que as letras das fatias continuem legíveis no celular
    const W = Math.round(Math.max(320, Math.min(680, vista.clientWidth || 680)));
    larguraDesenhada = W;
    const G = W < 480 ? 64 : 80, BW = W - G - 6, HF = 30, GAP = 26;
    const ini = Math.max(0, n - (LINHAS - 1));
    const fim = Math.min(N, n + 1); // linhas ini..fim-1; a linha n (se existir) é a próxima letra, ainda sem escolha
    const linhas = [];
    for (let i = ini; i < fim; i++) linhas.push(i);
    if (!linhas.length) {
      trocar(vista, h("p.c5-status", "Digite uma frase."));
      return;
    }
    const H = linhas.length * (HF + GAP) - GAP + 22;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "c5-svg c5-arit-svg", role: "img", "aria-label": "Intervalos da codificação aritmética, ampliados" });
    linhas.forEach((i, r) => {
      const y = 16 + r * (HF + GAP);
      const p = res.passos[i];
      const escolhida = i < n;
      // rótulo da linha
      svg.append(
        s("text", { x: 4, y: y + 15, class: "c5-arit-letra" }, escolhida ? rotulo(p.simbolo) : "?"),
        s("text", { x: 4, y: y + 28, class: "c5-tick" }, escolhida ? `${fmt(p.surpresa, 1)} bits` : "próxima")
      );
      let acc = 0;
      for (let t = 0; t < K; t++) {
        const x0 = G + (acc / T) * BW, w = (p.freqs[t] / T) * BW;
        const ehEsc = escolhida && t === p.simbolo;
        svg.append(s("rect", { x: x0, y, width: Math.max(w, 0.3), height: HF, class: ehEsc ? "c5-fatia c5-fatia-escolhida" : t % 2 ? "c5-fatia c5-fatia-impar" : "c5-fatia" }));
        if (w >= 12) svg.append(s("text", { x: x0 + w / 2, y: y + HF / 2 + 4, class: "c5-rotulo-svg" + (ehEsc ? " c5-rotulo-escolhido" : ""), "text-anchor": "middle" }, rotulo(t)));
        acc += p.freqs[t];
      }
      if (escolhida && r < linhas.length - 1) {
        const x0 = G + (p.acum / T) * BW, x1 = G + ((p.acum + p.freqs[p.simbolo]) / T) * BW;
        svg.append(s("path", { d: `M${x0} ${y + HF}L${x1} ${y + HF}L${G + BW} ${y + HF + GAP}L${G} ${y + HF + GAP}Z`, class: "c5-zoom" }));
      }
      if (r === 0) {
        svg.append(
          s("text", { x: G, y: y - 4, class: "c5-tick" }, ini === 0 ? "0" : "começo"),
          s("text", { x: G + BW, y: y - 4, class: "c5-tick", "text-anchor": "end" }, ini === 0 ? "1" : "fim")
        );
      }
    });
    trocar(vista, h("div.rolagem", svg));
  }

  function pararDec() {
    clearInterval(anim);
    anim = null;
  }

  function decodificar_(modo) {
    if (!res || !modelo || !N) return;
    pararDec();
    let bits = res.bits, o = ordem;
    if (modo === "outro") o = ordem >= 3 ? 1 : 5;
    let pos = -1;
    if (modo === "bit") {
      pos = Math.floor(bits.length * 0.4);
      bits = bits.slice(0, pos) + (bits[pos] === "0" ? "1" : "0") + bits.slice(pos + 1);
    }
    const out = decodificarAritmetico(bits, N, freqsCom(o), B);
    const original = decodificar(cod);
    const recebido = decodificar(out);
    let certas = 0;
    while (certas < N && out[certas] === cod[certas]) certas++;
    if (modo === "mesmo") explica.textContent = `Mesmo modelo, mesmas fatias: os ${res.bits.length} bits bastam para reconstruir as ${N} letras.`;
    else if (modo === "outro") explica.textContent = `Os mesmos ${res.bits.length} bits, lidos com fatias diferentes. ${certas ? `Só as primeiras ${certas} letras sobrevivem.` : "Já a primeira letra sai errada."}`;
    else explica.textContent = `O bit ${pos + 1} de ${bits.length} foi trocado. Até ali o número continua na fatia certa; depois, o decodificador escolhe uma fatia errada, e tudo o que vem a seguir é inventado pelo modelo.`;
    let i = 0;
    const passo = () => {
      i = Math.min(N, i + 1);
      trocar(saida, [...recebido.slice(0, i)].map((c, j) => (c === original[j] ? c : h("span.errado", c === " " ? "␣" : c))));
      if (i >= N) pararDec();
    };
    if (semMovimento()) {
      i = N - 1;
      passo();
    } else anim = setInterval(passo, 28);
  }

  async function outraFrase() {
    const d = await trechos();
    const f = d.frases[Math.floor(Math.random() * d.frases.length)];
    entrada.value = f.original;
    n = 6;
    recalcular();
  }

  let espera;
  entrada.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      n = Math.min(n, 6) || 6;
      recalcular();
    }, 300);
  });
  recalcular().catch(() => {});
  return () => {
    vivo = false;
    pararDec();
    clearTimeout(espera);
    observador?.disconnect();
  };
}

// ===========================================================================
// 5. A grande comparação
// ===========================================================================
function comparacao(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Quantos bits por letra · Memorial de Aires",
    legenda: "O começo de Memorial de Aires, sem pontuação nem maiúsculas, medido de verdade neste navegador. Para a codificação aritmética, o custo é a soma das surpresas dividida pelo número de letras (o codificador exato gasta no máximo 2 bits a mais no trecho inteiro). O gzip é o do próprio navegador.",
  });
  let tamanho = 20000;
  const TAMANHOS = [
    { valor: 2000, rotulo: "2 mil letras" },
    { valor: 20000, rotulo: "20 mil letras" },
    { valor: 0, rotulo: "o livro inteiro" },
  ];
  const sel = seletor(TAMANHOS, tamanho, (v) => {
    tamanho = v;
    medir();
  }, { id: "c5-comp-tamanho", rotuloAria: "Tamanho do trecho" });
  const status = h("p.c5-status", { role: "status" });
  const barras = h("div.c5-barras");
  const legenda = h(
    "div.c5-legenda",
    h("span", h("i.c5-amostra-cor.c5-cor-fixo"), "códigos sem modelo"),
    h("span", h("i.c5-amostra-cor.c5-cor-gzip"), "gzip"),
    h("span", h("i.c5-amostra-cor.c5-cor-modelo"), "aritmética + modelo de Machado")
  );
  corpo.append(h("div.linha", sel.el), status, legenda, barras);
  aviso(corpo);

  let vivo = true, ficha = 0;

  async function medir() {
    const minha = ++ficha;
    status.textContent = "Medindo…";
    const [completo, m] = await Promise.all([textoTeste(), obterModelo()]);
    if (!vivo || minha !== ficha) return;
    const texto = tamanho ? completo.slice(0, tamanho) : completo;
    const n = texto.length;
    const bytes = new TextEncoder().encode(texto);
    const linhas = [];
    linhas.push({ nome: "UTF-8, texto comum", v: (bytes.length * 8) / n, tipo: "fixo" });
    linhas.push({ nome: "código fixo de 6 bits", v: 6, tipo: "fixo" });
    linhas.push({ nome: "aritmética, 39 letras iguais", v: log2(K), tipo: "fixo" });
    const f = frequencias(texto);
    const { codigos } = huffman([...f].map(([simbolo, peso]) => ({ simbolo, peso })));
    let bh = 0;
    for (const [c, q] of f) bh += q * codigos.get(c).length;
    linhas.push({ nome: "Huffman de letras isoladas", v: bh / n, tipo: "fixo" });
    desenhar(linhas, n, true);
    let gz = null;
    try {
      gz = await gzip(bytes);
    } catch {
      gz = null;
    }
    if (!vivo || minha !== ficha) return;
    if (gz) linhas.push({ nome: "gzip", v: (gz.length * 8) / n, tipo: "gzip" });
    const cod = codificar(texto);
    for (let o = 0; o <= 5; o++) {
      let soma = 0;
      for (let i = 0; i < n; i++) {
        soma -= log2(m.prob(cod, cod[i], o, i));
        if (i % 25000 === 24999) {
          await pausa();
          if (!vivo || minha !== ficha) return;
        }
      }
      linhas.push({ nome: `aritmética, modelo de ordem ${o}`, v: soma / n, tipo: "modelo" });
      desenhar(linhas, n, o < 5);
      await pausa();
      if (!vivo || minha !== ficha) return;
    }
    status.textContent = `${fmtInt(n)} letras · ${fmtInt(bytes.length)} bytes em UTF-8` + (gz ? ` · ${fmtInt(gz.length)} bytes depois do gzip` : " · este navegador não oferece gzip embutido (CompressionStream), por isso essa barra ficou de fora");
  }

  function desenhar(linhas, n, parcial) {
    if (parcial) status.textContent = `Medindo ${fmtInt(n)} letras…`;
    const MAX = 9;
    const ord = [...linhas].sort((a, b) => b.v - a.v);
    trocar(
      barras,
      ord.map((l) =>
        h(
          "div.c5-barra-linha",
          h("span.c5-barra-nome", l.nome),
          h("span.c5-barra-trilho", h("span.c5-barra-cheia.c5-cor-" + l.tipo, { style: { width: `${(100 * l.v) / MAX}%` } })),
          h("span.c5-barra-valor", fmt(l.v, 2))
        )
      ),
      h(
        "div.c5-barra-linha.c5-barra-eixo",
        { "aria-hidden": "true" },
        h("span.c5-barra-nome", "bits por letra"),
        h("span.c5-barra-trilho", [0, 2, 4, 6, 8].map((v) => h("span.c5-eixo-marca", { style: { left: `${(100 * v) / MAX}%` } }, String(v)))),
        h("span.c5-barra-valor")
      )
    );
  }

  medir().catch(() => (status.textContent = "Não consegui carregar o texto. Recarregue a página."));
  return () => {
    vivo = false;
  };
}

// ===========================================================================
// 6. O acaso não comprime
// ===========================================================================
function acaso(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O gzip diante do acaso",
    legenda: "Cada barra é o tamanho depois do gzip, em proporção ao original (a linha vertical marca 100%). Letras sorteadas: cada uma das 39 com a mesma chance. Bytes sorteados: cada um dos 256 valores possíveis com a mesma chance.",
  });
  const N = 20000;
  const status = h("p.c5-status", { role: "status" });
  const amostra = h("p.c5-amostra-acaso");
  const linhasEl = h("div.c5-acaso");
  const btSortear = botao("Sortear de novo", () => medir(Date.now() >>> 0), { id: "c5-acaso-sortear" });
  corpo.append(linhasEl, h("div", h("span.c5-rotulo-campo", "Começo das letras sorteadas"), amostra), h("div.linha", btSortear), status);
  let vivo = true;

  async function medir(semente) {
    if (typeof CompressionStream !== "function") {
      status.textContent = "Este navegador não oferece compressão gzip embutida (a interface CompressionStream). O resultado, medido em outro computador, é o descrito no texto.";
      btSortear.disabled = true;
      return;
    }
    const rng = criarRng(semente);
    const enc = new TextEncoder();
    const machado = enc.encode((await textoTeste()).slice(0, N));
    let letras = "";
    for (let i = 0; i < N; i++) letras += ALFABETO[Math.floor(rng() * K)];
    const bytesL = enc.encode(letras);
    const bytesA = new Uint8Array(N);
    for (let i = 0; i < N; i++) bytesA[i] = Math.floor(rng() * 256);
    const gM = await gzip(machado);
    const gMM = await gzip(gM);
    const gL = await gzip(bytesL);
    const gA = await gzip(bytesA);
    if (!vivo) return;
    const linhas = [
      { nome: "Memorial de Aires", sub: `${fmtInt(N)} letras · ${fmt((gM.length * 8) / N, 2)} bits por letra`, de: machado.length, para: gM.length },
      { nome: "Letras sorteadas", sub: `${fmtInt(N)} letras · ${fmt((gL.length * 8) / N, 2)} bits por letra (entropia: ${fmt(log2(K), 2)})`, de: bytesL.length, para: gL.length },
      { nome: "Memorial já comprimido, de novo", sub: "a saída do gzip passada pelo gzip", de: gM.length, para: gMM.length },
      { nome: "Bytes sorteados", sub: `${fmtInt(N)} bytes ao acaso`, de: bytesA.length, para: gA.length },
    ];
    const ESC = 0.8; // 100% ocupa 80% do trilho
    trocar(
      linhasEl,
      linhas.map((l) => {
        const r = l.para / l.de;
        return h(
          "div.c5-acaso-linha",
          h("div.c5-acaso-nome", h("strong", l.nome), h("span", l.sub)),
          h("div.c5-acaso-trilho", h("span.c5-acaso-cheia" + (r >= 1 ? ".c5-cresceu" : ""), { style: { width: `${Math.min(100, 100 * r * ESC)}%` } }), h("span.c5-acaso-cem", { style: { left: `${100 * ESC}%` } })),
          h("div.c5-acaso-valor", `${fmtInt(l.de)} → ${fmtInt(l.para)} bytes · ${fmtPct(r, 1)}`)
        );
      })
    );
    amostra.textContent = letras.slice(0, 120) + "…";
    status.textContent = "";
  }

  medir(5).catch(() => (status.textContent = "Não consegui medir. Recarregue a página."));
  return () => {
    vivo = false;
  };
}
