// Capítulo 6 — Conversa no ruído
import { h, s, trocar, moldura, botao, deslizante, leituras, grafico, caminho, fmt, fmtPct, fmtInt } from "../assets/nucleo/ui.js";
import { ALFABETO, K, codificar } from "../assets/nucleo/alfabeto.js";
import { trechos } from "../assets/nucleo/modelo.js";
import {
  entropia,
  entropiaBinaria,
  capacidadeBSC,
  informacaoMutua,
  hammingCodificar,
  hammingSindrome,
  hammingDecodificar,
  criarRng,
} from "../assets/nucleo/info.js";

// ===========================================================================
// Lógica pura (testada em testes/c6.test.mjs)
// ===========================================================================

/** Bits por símbolo no código fixo do capítulo: 2^5 = 32 < 39 ≤ 64 = 2^6. */
export const LARGURA = 6;

/** Converte índices de símbolos em bits, LARGURA bits por símbolo, o mais significativo primeiro. */
export function bitsDeSimbolos(codigos, largura = LARGURA) {
  const out = [];
  for (const c of codigos) for (let j = largura - 1; j >= 0; j--) out.push((c >> j) & 1);
  return out;
}

/** Agrupa bits de volta em números de `largura` bits (podem passar de 38: códigos sem letra). */
export function simbolosDeBits(bits, largura = LARGURA) {
  const out = [];
  for (let i = 0; i + largura <= bits.length; i += largura) {
    let v = 0;
    for (let j = 0; j < largura; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}

/** Sorteia, uma vez, um número uniforme por bit. Com esses números fixos, aumentar p só acrescenta trocas. */
export function sortearRuido(n, rng) {
  const u = new Float64Array(n);
  for (let i = 0; i < n; i++) u[i] = rng();
  return u;
}

/** Canal binário simétrico com o ruído já sorteado: troca o bit i quando u[i] < p. */
export function aplicarRuido(bits, u, p) {
  return bits.map((b, i) => (u[i] < p ? 1 - b : b));
}

/** Coeficiente binomial (em ponto flutuante, exato para os tamanhos usados aqui). */
export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Probabilidade de erro por bit da repetição n× (n ímpar) com maioria: mais da metade das cópias trocadas. */
export function erroRepeticao(n, p) {
  let soma = 0;
  for (let k = Math.floor(n / 2) + 1; k <= n; k++) soma += binomial(n, k) * p ** k * (1 - p) ** (n - k);
  return soma;
}

/** Codifica uma sequência de bits em blocos Hamming(7,4); completa com zeros até múltiplo de 4. */
export function hammingCodificarBits(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 4) {
    const d = [0, 1, 2, 3].map((j) => bits[i + j] ?? 0);
    out.push(...hammingCodificar(d));
  }
  return out;
}

/** Decodifica blocos Hamming(7,4) e devolve os primeiros `nDados` bits de dados. */
export function hammingDecodificarBits(bits, nDados) {
  const out = [];
  for (let i = 0; i + 7 <= bits.length; i += 7) out.push(...hammingDecodificar(bits.slice(i, i + 7)).dados);
  return out.slice(0, nDados);
}

/** Probabilidade exata de um bit de dados sair errado no Hamming(7,4), somando os 128 padrões de erro. */
export function erroBitHamming(p) {
  let total = 0;
  for (let e = 0; e < 128; e++) {
    const r = Array.from({ length: 7 }, (_, i) => (e >> i) & 1); // palavra zero mais o erro
    const w = r.reduce((a, b) => a + b, 0);
    const errados = hammingDecodificar(r).dados.reduce((a, b) => a + b, 0);
    total += p ** w * (1 - p) ** (7 - w) * (errados / 4);
  }
  return total;
}

/** As 16 palavras-código do Hamming(7,4). */
export function palavrasHamming() {
  return Array.from({ length: 16 }, (_, d) => hammingCodificar([(d >> 3) & 1, (d >> 2) & 1, (d >> 1) & 1, d & 1]));
}

/** Distância de Hamming entre duas sequências de bits do mesmo tamanho. */
export function distancia(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] !== b[i] ? 1 : 0;
  return d;
}

/** Menor distância entre pares distintos de uma lista de palavras. */
export function distanciaMinima(palavras) {
  let m = Infinity;
  for (let i = 0; i < palavras.length; i++) for (let j = i + 1; j < palavras.length; j++) m = Math.min(m, distancia(palavras[i], palavras[j]));
  return m;
}

/** Número de bits 1 num inteiro de 32 bits. */
export function contarUns(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Sorteia um código aleatório: M palavras de n bits (n ≤ 30), como inteiros. */
export function codigoAleatorio(n, M, rng) {
  const c = new Uint32Array(M);
  const teto = 2 ** n;
  for (let i = 0; i < M; i++) c[i] = Math.floor(rng() * teto);
  return c;
}

/**
 * Um envio por um código aleatório: escolhe uma mensagem, passa a palavra pelo canal,
 * decodifica pela palavra mais próxima (empates sorteados). Devolve true se errou a mensagem.
 */
export function envioAleatorio(codigo, n, p, rng) {
  const M = codigo.length;
  const m = Math.floor(rng() * M);
  let e = 0;
  for (let j = 0; j < n; j++) if (rng() < p) e |= 1 << j;
  const y = (codigo[m] ^ e) >>> 0;
  let melhor = 99, empates = 0, escolha = -1;
  for (let i = 0; i < M; i++) {
    const d = contarUns((codigo[i] ^ y) >>> 0);
    if (d < melhor) {
      melhor = d;
      empates = 1;
      escolha = i;
    } else if (d === melhor) {
      empates++;
      if (rng() * empates < 1) escolha = i;
    }
  }
  return escolha !== m;
}

/** Distribuição conjunta p[x][y] do canal binário simétrico com P(X = 1) = q. */
export function conjuntaBSC(q, p) {
  return [
    [(1 - q) * (1 - p), (1 - q) * p],
    [q * p, q * (1 - p)],
  ];
}

/** Entropia condicional H(X|Y) = H(X,Y) − H(Y), a partir da conjunta p[x][y]. */
export function entropiaCondicionalXY(conj) {
  const hxy = entropia(conj.flat());
  const py = conj[0].map((_, j) => conj.reduce((a, l) => a + l[j], 0));
  return hxy - entropia(py);
}

const SOBRESCRITOS = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
/** Probabilidade legível: porcentagem quando ≥ 0,1%; senão notação científica com vírgula. */
export function fmtProb(x) {
  if (x === 0) return "0";
  if (x >= 0.001) return fmtPct(x, x >= 0.1 ? 1 : 2);
  let e = Math.floor(Math.log10(x));
  let m = x / 10 ** e;
  if (+m.toFixed(1) >= 10) {
    m /= 10;
    e += 1;
  }
  return `${fmt(m, 1)} × 10${String(e).replace(/./g, (c) => SOBRESCRITOS[c])}`;
}

// ===========================================================================
// Montagem
// ===========================================================================

export async function montar(raiz) {
  const limpar = [];
  const fabricas = { diagrama, canal, repeticao, hamming, comparar, capacidade, aleatorios };
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const f = fabricas[fig.dataset.widget];
    if (f) limpar.push(f(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// Frases de Memorial de Aires curtas o bastante para caber em poucas linhas no celular.
let frasesPromessa = null;
function frasesCurtas() {
  frasesPromessa ??= trechos().then((d) => d.frases.filter((f) => f.normalizado.length >= 55 && f.normalizado.length <= 95));
  return frasesPromessa;
}

/** Texto recebido, letra a letra, com as letras diferentes do enviado marcadas. */
function textoRecebido(enviado, recebidos) {
  const el = h("p.c6-texto");
  let erradas = 0;
  recebidos.forEach((c, i) => {
    const original = enviado[i];
    const valido = c < K;
    const letra = valido ? ALFABETO[c] : "□";
    if (valido && letra === original) {
      el.append(letra);
    } else {
      erradas++;
      el.append(
        h("span.c6-errado" + (letra === " " ? ".c6-espaco" : ""), { title: valido ? `era “${original === " " ? "espaço" : original}”` : "código de 6 bits sem letra correspondente" }, letra === " " ? " " : letra)
      );
    }
  });
  return { el, erradas };
}

/** Bits recebidos em grupos de 6, com as trocas marcadas. */
function bitsMarcados(enviados, recebidos, grupo = LARGURA) {
  const el = h("p.bits.c6-bits");
  let palavra = h("span.c6-grupo");
  recebidos.forEach((b, i) => {
    palavra.append(b !== enviados[i] ? h("span.bit-trocado", String(b)) : String(b));
    if ((i + 1) % grupo === 0) {
      el.append(palavra, " ");
      palavra = h("span.c6-grupo");
    }
  });
  if (palavra.childNodes.length) el.append(palavra);
  return el;
}

/** Largura do viewBox de um gráfico: a largura real do contêiner, para o texto não encolher no celular. */
function larguraUtil(el, max = 640) {
  const w = el?.clientWidth || max;
  return Math.max(320, Math.min(max, Math.round(w)));
}

/** Chama `f` quando a largura do elemento muda de verdade. Devolve a função de limpeza. */
function aoRedimensionar(el, f) {
  if (typeof ResizeObserver === "undefined") return () => {};
  let ultima = el.clientWidth, espera = null;
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (Math.abs(w - ultima) < 24) return;
    ultima = w;
    clearTimeout(espera);
    espera = setTimeout(f, 150);
  });
  ro.observe(el);
  return () => {
    ro.disconnect();
    clearTimeout(espera);
  };
}

function campo(rotulo, ...filhos) {
  return h("div.c6-campo", h("span.c6-rotulo", rotulo), ...filhos);
}

// ---------------------------------------------------------------------------
// O diagrama de 1948
// ---------------------------------------------------------------------------
function diagrama(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O esquema de Shannon (1948)",
    legenda: "Redesenhado a partir da figura 1 do artigo de 1948, com os nomes em português. Embaixo, a palavra “vida” atravessando o esquema sem nenhum código corretor: um único bit trocado no canal vira uma letra trocada no destino.",
  });

  const caixas = [
    { id: "fonte", linhas: ["fonte de", "informação"] },
    { id: "tx", linhas: ["transmissor", "(codificador)"] },
    { id: "canal", linhas: ["canal"] },
    { id: "rx", linhas: ["receptor", "(decodificador)"] },
    { id: "destino", linhas: ["destino"] },
  ];
  const setas = ["mensagem", "sinal", "sinal recebido", "mensagem"];

  function desenhar(vertical) {
    const W = vertical ? 340 : 900, H = vertical ? 470 : 216;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "c6-esquema " + (vertical ? "c6-esquema-estreito" : "c6-esquema-largo"), role: "img", "aria-label": "Fonte de informação, transmissor, canal com fonte de ruído, receptor e destino, ligados por setas." });
    svg.append(s("defs", {}, s("marker", { id: "c6-ponta" + (vertical ? "v" : "h"), viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0 0 L10 5 L0 10 z", class: "c6-ponta" }))));
    const ponta = `url(#c6-ponta${vertical ? "v" : "h"})`;
    const pos = [];
    caixas.forEach((c, i) => {
      let x, y, w, hh;
      if (vertical) {
        w = c.id === "canal" ? 110 : 170; hh = 52;
        x = 20 + (170 - w) / 2; y = 10 + i * 92;
      } else {
        w = c.id === "canal" ? 74 : 120; hh = 66;
        const xs = [10, 211, 412, 567, 768];
        x = xs[i]; y = 34;
      }
      pos.push({ x, y, w, hh });
      const g = s("g", { class: "c6-caixa" + (c.id === "canal" ? " c6-caixa-canal" : "") });
      g.append(s("rect", { x, y, width: w, height: hh, rx: 3 }));
      const y0 = y + hh / 2 - (c.linhas.length - 1) * 9;
      c.linhas.forEach((t, k) => g.append(s("text", { x: x + w / 2, y: y0 + k * 18, "text-anchor": "middle", "dominant-baseline": "middle", class: k ? "c6-caixa-sub" : "" }, t)));
      svg.append(g);
    });
    // setas entre as caixas
    for (let i = 0; i < 4; i++) {
      const a = pos[i], b = pos[i + 1];
      if (vertical) {
        const xm = 105;
        svg.append(s("line", { x1: xm, y1: a.y + a.hh, x2: xm, y2: b.y - 2, class: "c6-seta", "marker-end": ponta }));
        svg.append(s("text", { x: xm + 10, y: (a.y + a.hh + b.y) / 2, "dominant-baseline": "middle", class: "c6-rotulo-seta" }, setas[i]));
      } else {
        const ym = a.y + a.hh / 2;
        svg.append(s("line", { x1: a.x + a.w, y1: ym, x2: b.x - 2, y2: ym, class: "c6-seta", "marker-end": ponta }));
        const partes = setas[i].split(" ");
        partes.forEach((t, j) => svg.append(s("text", { x: (a.x + a.w + b.x) / 2, y: ym - 12 - (partes.length - 1 - j) * 15, "text-anchor": "middle", class: "c6-rotulo-seta" }, t)));
      }
    }
    // fonte de ruído
    const c = pos[2];
    if (vertical) {
      const r = { x: 230, y: c.y - 4, w: 100, hh: 60 };
      svg.append(
        s("g", { class: "c6-caixa c6-caixa-ruido" }, s("rect", { x: r.x, y: r.y, width: r.w, height: r.hh, rx: 3 }), s("text", { x: r.x + r.w / 2, y: r.y + 21, "text-anchor": "middle", "dominant-baseline": "middle" }, "fonte de"), s("text", { x: r.x + r.w / 2, y: r.y + 39, "text-anchor": "middle", "dominant-baseline": "middle" }, "ruído")),
        s("line", { x1: r.x, y1: c.y + c.hh / 2, x2: c.x + c.w + 2, y2: c.y + c.hh / 2, class: "c6-seta c6-seta-ruido", "marker-end": ponta })
      );
    } else {
      const r = { x: c.x + c.w / 2 - 65, y: 150, w: 130, hh: 56 };
      svg.append(
        s("g", { class: "c6-caixa c6-caixa-ruido" }, s("rect", { x: r.x, y: r.y, width: r.w, height: r.hh, rx: 3 }), s("text", { x: r.x + r.w / 2, y: r.y + r.hh / 2, "text-anchor": "middle", "dominant-baseline": "middle" }, "fonte de ruído")),
        s("line", { x1: c.x + c.w / 2, y1: r.y, x2: c.x + c.w / 2, y2: c.y + c.hh + 2, class: "c6-seta c6-seta-ruido", "marker-end": ponta })
      );
    }
    return svg;
  }

  // exemplo concreto: "vida" em 6 bits por letra, com um bit trocado no "i"
  const palavra = "vida";
  const enviados = bitsDeSimbolos(codificar(palavra));
  const recebidos = enviados.slice();
  recebidos[10] ^= 1; // penúltimo bit do "i": 001001 vira 001011, o "k"
  const exemplo = h(
    "dl.c6-exemplo",
    h("div", h("dt", "mensagem"), h("dd", h("span.c6-texto-ex", "vida"))),
    h("div", h("dt", "sinal enviado"), h("dd", bitsMarcados(enviados, enviados))),
    h("div", h("dt", "sinal recebido"), h("dd", bitsMarcados(enviados, recebidos))),
    h("div", h("dt", "mensagem entregue"), h("dd", h("span.c6-texto-ex", [...textoRecebido(palavra, simbolosDeBits(recebidos)).el.childNodes])))
  );
  corpo.append(h("div.c6-esquema-caixa", desenhar(false), desenhar(true)), exemplo);
  return () => {};
}

// ---------------------------------------------------------------------------
// Uma frase pelo canal binário simétrico
// ---------------------------------------------------------------------------
function canal(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Machado num canal binário simétrico",
    legenda: "Cada letra vira 6 bits; cada bit é trocado com probabilidade p, de forma independente. O sorteio do ruído fica fixo enquanto você mexe em p: subir p só acrescenta trocas. Um □ indica um grupo de 6 bits que não corresponde a nenhuma letra.",
  });
  let frases = [], k = 0, semente = 1, frase = "", enviados = [], u = null;
  const enviadoEl = h("p.c6-texto.c6-original");
  const recebidoEl = h("div");
  const bitsEl = h("div");
  const placa = leituras([
    { chave: "bits", rotulo: "bits trocados", valor: "—" },
    { chave: "letras", rotulo: "letras erradas", valor: "—", destaque: true },
    { chave: "esperado", rotulo: "esperado: 1 − (1 − p)⁶", valor: "—" },
  ]);
  const p = deslizante({ id: "c6-canal-p", rotulo: "probabilidade de troca p", min: 0, max: 0.25, passo: 0.005, valor: 0.02, formato: (v) => fmtPct(v, 1), aoMudar: () => desenhar() });
  const btFrase = botao("Outra frase", () => nova(1), { variante: "secundario", id: "c6-canal-frase" });
  const btRuido = botao("Sortear outro ruído", () => {
    semente++;
    sortear();
    desenhar();
  }, { variante: "discreto", id: "c6-canal-ruido" });
  corpo.append(
    p.el,
    h("div.linha", btFrase, btRuido),
    campo("enviado", enviadoEl),
    campo("recebido", recebidoEl),
    placa.el,
    h("details.c6-detalhes", h("summary", "ver os bits recebidos"), bitsEl)
  );

  function sortear() {
    u = sortearRuido(enviados.length, criarRng(9173 * semente + k));
  }
  async function nova(passo = 0) {
    if (!frases.length) {
      const todas = await frasesCurtas();
      const fav = todas.findIndex((f) => f.original.startsWith("Cuidei que não acabaria"));
      frases = todas;
      k = fav >= 0 ? fav : 0;
    } else k = (k + passo * 37) % frases.length;
    frase = frases[k].normalizado;
    enviados = bitsDeSimbolos(codificar(frase));
    sortear();
    enviadoEl.textContent = frase;
    desenhar();
  }
  function desenhar() {
    if (!frase) return;
    const pv = p.valor();
    const rec = aplicarRuido(enviados, u, pv);
    const { el, erradas } = textoRecebido(frase, simbolosDeBits(rec));
    trocar(recebidoEl, el);
    trocar(bitsEl, bitsMarcados(enviados, rec));
    const trocados = rec.reduce((a, b, i) => a + (b !== enviados[i]), 0);
    placa.definir("bits", `${trocados} de ${fmtInt(enviados.length)}`);
    placa.definir("letras", `${erradas} de ${frase.length}`);
    placa.definir("esperado", fmtPct(1 - (1 - pv) ** LARGURA, 1));
  }
  nova();
  return () => {};
}

// ---------------------------------------------------------------------------
// Códigos de repetição: taxa contra erro
// ---------------------------------------------------------------------------
function repeticao(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Repetir: quanto custa cada casa decimal",
    legenda: "Cada ponto é um código de repetição n× com decodificação por maioria (n = 1, 3, 5, … 25), colocado na taxa 1/n e na probabilidade exata de erro por bit; o amarelo é o n escolhido. O eixo vertical é logarítmico: cada linha de grade é um fator de 10. O losango é o código de Hamming(7,4), da próxima seção. A linha tracejada é a capacidade do canal, que aparece mais adiante.",
  });
  const N_SIM = 100000;
  const pD = deslizante({ id: "c6-rep-p", rotulo: "probabilidade de troca p", min: 0.01, max: 0.3, passo: 0.01, valor: 0.1, formato: (v) => fmtPct(v, 0), aoMudar: () => atualizar() });
  const nD = deslizante({ id: "c6-rep-n", rotulo: "repetições n", min: 1, max: 15, passo: 2, valor: 3, formato: (v) => `${v}×`, aoMudar: () => atualizar() });
  const placa = leituras([
    { chave: "taxa", rotulo: "taxa", valor: "—" },
    { chave: "exato", rotulo: "erro por bit · exato", valor: "—", destaque: true },
    { chave: "sim", rotulo: `simulado · ${fmtInt(N_SIM)} bits`, valor: "—" },
  ]);
  const grafo = h("div.rolagem");
  corpo.append(h("div.colunas.c6-controles", pD.el, nD.el), placa.el, grafo);
  let semente = 3;
  const desligar = aoRedimensionar(grafo, () => atualizar());

  function simular(n, p) {
    const rng = criarRng(semente++);
    let erros = 0;
    for (let i = 0; i < N_SIM; i++) {
      let trocas = 0;
      for (let j = 0; j < n; j++) if (rng() < p) trocas++;
      if (2 * trocas > n) erros++;
    }
    return erros / N_SIM;
  }

  function atualizar() {
    const p = pD.valor(), n = nD.valor();
    placa.definir("taxa", n === 1 ? "1" : `1/${n} ≈ ${fmt(1 / n, 2)}`);
    placa.definir("exato", fmtProb(erroRepeticao(n, p)));
    const sim = simular(n, p);
    placa.definir("sim", sim === 0 ? `0 erros` : fmtProb(sim));

    const Y0 = -8;
    const L = (v) => Math.max(Y0, Math.log10(v));
    const g = grafico({
      largura: larguraUtil(grafo), altura: 330, x: [0, 1.04], y: [Y0, 0],
      margem: { t: 16, r: 18, b: 46, l: 58 },
      ticksX: [0, 0.2, 0.4, 0.6, 0.8, 1], ticksY: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
      fmtX: (v) => fmt(v, 1), fmtY: (v) => (v === 0 ? "1" : "10" + String(v).replace(/./g, (c) => SOBRESCRITOS[c])),
      rotuloX: "taxa: bits de mensagem por bit enviado", rotuloY: "erro por bit",
    });
    const C = capacidadeBSC(p);
    g.plot.append(
      s("line", { x1: g.x(C), x2: g.x(C), y1: g.y(0), y2: g.y(Y0), class: "referencia" }),
      s("text", { x: g.x(C) - 6, y: g.y(-7.6), class: "anotacao", "text-anchor": "end" }, `capacidade ${fmt(C, 2)}`)
    );
    const pts = [];
    for (let m = 1; m <= 25; m += 2) pts.push({ m, x: 1 / m, y: erroRepeticao(m, p) });
    const vis = pts.filter((q) => q.y >= 10 ** Y0);
    g.plot.append(s("path", { d: caminho(vis.map((q) => [g.x(q.x), g.y(L(q.y))])), class: "linha-dados" }));
    for (const q of vis) {
      const sel = q.m === n;
      g.plot.append(s("circle", { cx: g.x(q.x), cy: g.y(L(q.y)), r: sel ? 6.5 : 4, class: "ponto" + (sel ? " c6-ponto-sel" : "") }, s("title", {}, `${q.m}×: taxa ${fmt(q.x, 2)}, erro ${fmtProb(q.y)}`)));
      if (q.m <= 5) g.plot.append(s("text", { x: g.x(q.x) + 8, y: g.y(L(q.y)) - 8, class: "anotacao-dados" }, `${q.m}×`));
    }
    const hy = erroBitHamming(p);
    if (hy >= 10 ** Y0) {
      const hx = g.x(4 / 7), hyy = g.y(L(hy));
      g.plot.append(
        s("path", { d: `M${hx} ${hyy - 7} L${hx + 7} ${hyy} L${hx} ${hyy + 7} L${hx - 7} ${hyy} z`, class: "c6-losango" }, s("title", {}, `Hamming(7,4): taxa ${fmt(4 / 7, 2)}, erro ${fmtProb(hy)}`)),
        s("text", { x: hx + 10, y: hyy + 16, class: "anotacao-dados" }, "Hamming(7,4)")
      );
    }
    trocar(grafo, g.svg);
  }
  // primeiro desenho no próximo quadro: a largura do contêiner já estará calculada sem forçar um leiaute extra
  const q0 = requestAnimationFrame(() => atualizar());
  return () => {
    cancelAnimationFrame(q0);
    desligar();
  };
}

// ---------------------------------------------------------------------------
// Hamming(7,4) com três círculos
// ---------------------------------------------------------------------------
// Círculo A confere as posições 1,3,5,7; B confere 2,3,6,7; C confere 4,5,6,7.
const CIRCULOS = [
  { nome: "A", cx: 130, cy: 125, pos: [1, 3, 5, 7], rx: 52, ry: 52, anc: "end" },
  { nome: "B", cx: 210, cy: 125, pos: [2, 3, 6, 7], rx: 288, ry: 52, anc: "start" },
  { nome: "C", cx: 170, cy: 195, pos: [4, 5, 6, 7], rx: 170, ry: 304, anc: "middle" },
];
const REGIOES = { 7: [170, 150], 3: [170, 86], 5: [120, 184], 6: [220, 184], 1: [86, 110], 2: [254, 110], 4: [170, 246] };
const PAPEL = ["p₁", "p₂", "d₁", "p₄", "d₂", "d₃", "d₄"];

function hamming(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Hamming(7,4): três círculos, sete bits",
    legenda: "Escolha os quatro bits de dados (d₁ a d₄); as três paridades (p₁, p₂, p₄) são calculadas para que cada círculo tenha um número par de 1. Depois faça o papel do ruído: toque em qualquer bit, no diagrama ou na fileira, para trocá-lo. Círculos com número ímpar de 1 ficam vermelhos.",
  });
  let dados = [1, 0, 1, 1];
  let enviada = hammingCodificar(dados);
  let recebida = enviada.slice();

  const botoesDados = dados.map((_, i) =>
    h("button.c6-bit-dado", { type: "button", id: `c6-ham-d${i + 1}`, on: { click: () => { dados[i] ^= 1; recomecar(); } } })
  );
  const svg = s("svg", { viewBox: "0 0 340 318", class: "c6-venn", role: "group", "aria-label": "Diagrama de três círculos do código de Hamming" });
  const circ = CIRCULOS.map((c) => s("circle", { cx: c.cx, cy: c.cy, r: 85, class: "c6-circulo" }));
  const rotCirc = CIRCULOS.map((c) => s("text", { x: c.rx, y: c.ry, "text-anchor": c.anc, class: "c6-circulo-nome" }, c.nome));
  svg.append(...circ, ...rotCirc);
  const celulas = [];
  for (let pos = 1; pos <= 7; pos++) {
    const [x, y] = REGIOES[pos];
    const ehParidade = pos === 1 || pos === 2 || pos === 4;
    const valor = s("text", { x, y: y + 1, "text-anchor": "middle", "dominant-baseline": "middle", class: "c6-venn-bit" });
    const g = s(
      "g",
      {
        class: "c6-venn-cel" + (ehParidade ? " c6-paridade" : ""),
        tabindex: 0,
        role: "button",
        on: {
          click: () => trocarBit(pos - 1),
          keydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              trocarBit(pos - 1);
            }
          },
        },
      },
      s("rect", { x: x - 17, y: y - 17, width: 34, height: 34, rx: ehParidade ? 17 : 4, class: "c6-venn-fundo" }),
      valor,
      s("text", { x: x + 21, y: y + 17, class: "c6-venn-pos" }, String(pos))
    );
    celulas.push({ g, valor });
    svg.append(g);
  }

  const fileira = h("div.c6-fileira", { role: "group", "aria-label": "Os sete bits recebidos, posições 1 a 7" });
  const botoesFileira = [];
  for (let i = 0; i < 7; i++) {
    const b = h("button.c6-fileira-bit", { type: "button", id: `c6-ham-pos${i + 1}`, on: { click: () => trocarBit(i) } });
    botoesFileira.push(b);
    fileira.append(h("div.c6-fileira-cel", h("span.c6-fileira-pos", String(i + 1)), b, h("span.c6-fileira-papel", PAPEL[i])));
  }
  const diagnostico = h("p.c6-diagnostico", { role: "status" });
  const placa = leituras([
    { chave: "sind", rotulo: "síndrome (C B A)", valor: "—", destaque: true },
    { chave: "erros", rotulo: "bits trocados pelo ruído", valor: "0" },
    { chave: "dados", rotulo: "dados decodificados", valor: "—" },
  ]);
  const btUm = botao("Um erro ao acaso", () => {
    recebida = enviada.slice();
    recebida[Math.floor(Math.random() * 7)] ^= 1;
    desenhar();
  }, { variante: "secundario", id: "c6-ham-um" });
  const btLimpar = botao("Limpar o ruído", () => {
    recebida = enviada.slice();
    desenhar();
  }, { variante: "discreto", id: "c6-ham-limpar" });

  corpo.append(
    h("div.c6-ham-grade",
      h("div.c6-ham-venn", svg),
      h("div.c6-ham-lado",
        h("div", h("span.c6-rotulo", "dados escolhidos"), h("div.c6-dados", botoesDados)),
        h("div", h("span.c6-rotulo", "a palavra de 7 bits (toque para trocar)"), fileira),
        h("div.linha", btUm, btLimpar),
        placa.el
      )
    ),
    diagnostico
  );

  function recomecar() {
    enviada = hammingCodificar(dados);
    recebida = enviada.slice();
    desenhar();
  }
  function trocarBit(i) {
    recebida[i] ^= 1;
    desenhar();
  }
  function desenhar() {
    botoesDados.forEach((b, i) => {
      b.textContent = String(dados[i]);
      b.setAttribute("aria-label", `bit de dados d${i + 1}: ${dados[i]}. Toque para mudar.`);
    });
    const falhas = CIRCULOS.map((c) => c.pos.reduce((a, p) => a ^ recebida[p - 1], 0));
    circ.forEach((el, i) => el.classList.toggle("c6-falha", falhas[i] === 1));
    rotCirc.forEach((el, i) => el.classList.toggle("c6-falha", falhas[i] === 1));
    for (let i = 0; i < 7; i++) {
      const trocado = recebida[i] !== enviada[i];
      celulas[i].valor.textContent = String(recebida[i]);
      celulas[i].g.classList.toggle("c6-trocado", trocado);
      celulas[i].g.setAttribute("aria-label", `posição ${i + 1} (${PAPEL[i]}): ${recebida[i]}${trocado ? ", trocado pelo ruído" : ""}. Toque para trocar.`);
      botoesFileira[i].textContent = String(recebida[i]);
      botoesFileira[i].classList.toggle("c6-trocado", trocado);
      botoesFileira[i].setAttribute("aria-label", `posição ${i + 1}, ${PAPEL[i]}: ${recebida[i]}`);
    }
    const dec = hammingDecodificar(recebida);
    const sind = hammingSindrome(recebida);
    const nErros = distancia(recebida, enviada);
    const certo = dec.dados.every((d, i) => d === dados[i]);
    placa.definir("sind", `${falhas[2]}${falhas[1]}${falhas[0]} = ${sind}`);
    placa.definir("erros", String(nErros));
    placa.definir("dados", `${dec.dados.join("")} ${certo ? "✓" : "✗"}`);
    const quais = CIRCULOS.filter((_, i) => falhas[i]).map((c) => c.nome);
    const lista = (a) => (a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " e " + a.at(-1));
    let msg;
    if (sind === 0 && nErros === 0) msg = "Os três círculos têm número par de 1. Síndrome zero: nada a corrigir.";
    else if (sind === 0) msg = `Nenhum círculo acusa erro, mas ${nErros} bits foram trocados: o ruído transformou a palavra enviada em outra palavra-código válida. O receptor não tem como perceber.`;
    else {
      const dentro = quais.length === 3 ? "dentro dos três círculos" : quais.length === 1 ? `só dentro de ${quais[0]}` : `dentro de ${lista(quais)} e fora de ${CIRCULOS.find((_, i) => !falhas[i]).nome}`;
      msg = `${quais.length === 1 ? "O círculo" : "Os círculos"} ${lista(quais)} ${quais.length === 1 ? "acusa" : "acusam"} paridade ímpar. O único lugar ${dentro} é a posição ${sind}, e o decodificador troca esse bit. `;
      if (nErros === 1 && certo) msg += "Era mesmo ele: os dados saem corretos.";
      else if (certo) msg += `Por sorte os dados saem corretos, embora ${nErros} bits tenham sido trocados.`;
      else if (nErros === 2) msg += `Mas o ruído trocou dois bits, e a posição ${sind} não era nenhum deles. A “correção” acrescenta um terceiro erro e os dados saem errados.`;
      else msg += `Com ${nErros} bits trocados, a correção aponta para o lugar errado e os dados saem errados.`;
    }
    diagnostico.textContent = msg;
    diagnostico.classList.toggle("c6-mau", !certo);
  }
  desenhar();
  return () => {};
}

// ---------------------------------------------------------------------------
// Comparação na mesma frase
// ---------------------------------------------------------------------------
function comparar(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Três maneiras de mandar a mesma frase",
    legenda: "Mesma frase, mesmo canal. Cada esquema gasta um número diferente de bits no canal e sofre o seu próprio sorteio de ruído, que fica fixo enquanto você mexe em p.",
  });
  let frases = [], k = 0, semente = 1, frase = "", dadosBits = [];
  const esquemas = [
    { nome: "sem código", taxa: "taxa 1", cod: (b) => b, dec: (r) => r },
    { nome: "repetição 3×", taxa: "taxa 1/3", cod: (b) => b.flatMap((x) => [x, x, x]), dec: (r) => { const o = []; for (let i = 0; i + 3 <= r.length; i += 3) o.push(r[i] + r[i + 1] + r[i + 2] >= 2 ? 1 : 0); return o; } },
    { nome: "Hamming(7,4)", taxa: "taxa 4/7", cod: hammingCodificarBits, dec: (r, n) => hammingDecodificarBits(r, n) },
  ];
  const linhas = esquemas.map((e) => {
    const texto = h("div");
    const info = h("span.c6-esq-info");
    const el = h("div.c6-esquema-linha", h("div.c6-esq-cabeca", h("strong", e.nome), " ", h("span.c6-esq-taxa", e.taxa), info), texto);
    return { ...e, el, texto, info, enviados: [], u: null };
  });
  const pD = deslizante({ id: "c6-cmp-p", rotulo: "probabilidade de troca p", min: 0, max: 0.15, passo: 0.005, valor: 0.03, formato: (v) => fmtPct(v, 1), aoMudar: () => desenhar() });
  corpo.append(
    pD.el,
    h("div.linha", botao("Outra frase", () => nova(1), { id: "c6-cmp-frase" }), botao("Sortear outro ruído", () => { semente++; sortear(); desenhar(); }, { variante: "discreto", id: "c6-cmp-ruido" })),
    campo("enviado", h("p.c6-texto.c6-original#c6-cmp-original")),
    ...linhas.map((l) => l.el)
  );
  function sortear() {
    linhas.forEach((l, i) => (l.u = sortearRuido(l.enviados.length, criarRng(7919 * semente + 101 * i + k))));
  }
  async function nova(passo = 0) {
    if (!frases.length) {
      frases = await frasesCurtas();
      const fav = frases.findIndex((f) => f.original.startsWith("Ela ainda agora o ama"));
      k = fav >= 0 ? fav : 0;
    } else k = (k + passo * 53) % frases.length;
    frase = frases[k].normalizado;
    corpo.querySelector("#c6-cmp-original").textContent = frase;
    dadosBits = bitsDeSimbolos(codificar(frase));
    linhas.forEach((l) => (l.enviados = l.cod(dadosBits)));
    sortear();
    desenhar();
  }
  function desenhar() {
    if (!frase) return;
    const p = pD.valor();
    for (const l of linhas) {
      const rec = aplicarRuido(l.enviados, l.u, p);
      const bits = l.dec(rec, dadosBits.length);
      const { el, erradas } = textoRecebido(frase, simbolosDeBits(bits));
      trocar(l.texto, el);
      l.info.textContent = ` · ${fmtInt(l.enviados.length)} bits no canal · ${erradas} ${erradas === 1 ? "letra errada" : "letras erradas"}`;
    }
  }
  nova();
  return () => {};
}

// ---------------------------------------------------------------------------
// Informação mútua e capacidade
// ---------------------------------------------------------------------------
function capacidade(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Quanto passa pelo canal",
    legenda: "No desenho do canal, a espessura de cada seta é a probabilidade daquele caminho, e os números à esquerda são as frações de 0 e de 1 que o transmissor envia (q é a fração de 1). O primeiro gráfico mostra a informação mútua para cada q, com o p escolhido; o máximo, sempre em q = 1/2, é a capacidade. O segundo mostra a capacidade para cada p.",
  });
  const pD = deslizante({ id: "c6-cap-p", rotulo: "probabilidade de troca p", min: 0, max: 1, passo: 0.01, valor: 0.1, formato: (v) => fmt(v, 2), aoMudar: () => desenhar() });
  const qD = deslizante({ id: "c6-cap-q", rotulo: "fração de 1 enviados q", min: 0, max: 1, passo: 0.01, valor: 0.5, formato: (v) => fmt(v, 2), aoMudar: () => desenhar() });
  const placa = leituras([
    { chave: "hx", rotulo: "H(X)", valor: "—" },
    { chave: "hxy", rotulo: "H(X|Y)", valor: "—" },
    { chave: "i", rotulo: "I(X;Y)", valor: "—", destaque: true },
    { chave: "c", rotulo: "capacidade C", valor: "—" },
  ]);
  const esquema = h("div.c6-bsc");
  const g1 = h("div"), g2 = h("div");
  const graficos = h("div.colunas.c6-cap-graficos", g1, g2);
  corpo.append(
    h("div.colunas.c6-controles", pD.el, qD.el),
    h("div.c6-cap-grade", esquema, placa.el),
    graficos
  );
  const desligar = aoRedimensionar(graficos, () => desenhar());

  function desenharBSC(p, q) {
    const svg = s("svg", { viewBox: "0 0 300 200", class: "c6-bsc-svg", role: "img", "aria-label": `Canal binário simétrico com p = ${fmt(p, 2)}` });
    const xe = 60, xs = 240, y0 = 50, y1 = 150;
    const larg = (v) => 0.6 + 9 * v;
    const ramos = [
      [y0, y0, (1 - q) * (1 - p), "1 − p"],
      [y0, y1, (1 - q) * p, "p"],
      [y1, y0, q * p, "p"],
      [y1, y1, q * (1 - p), "1 − p"],
    ];
    for (const [a, b, v] of ramos) svg.append(s("line", { x1: xe + 14, y1: a, x2: xs - 14, y2: b, class: "c6-ramo", "stroke-width": larg(v) }));
    svg.append(
      s("text", { x: 150, y: y0 - 10, "text-anchor": "middle", class: "c6-ramo-rot" }, `1 − p = ${fmt(1 - p, 2)}`),
      s("text", { x: 150, y: y1 + 20, "text-anchor": "middle", class: "c6-ramo-rot" }, `1 − p = ${fmt(1 - p, 2)}`),
      s("text", { x: 150, y: 80, "text-anchor": "middle", class: "c6-ramo-rot" }, `p = ${fmt(p, 2)}`)
    );
    for (const [x, y, t] of [[xe, y0, "0"], [xe, y1, "1"], [xs, y0, "0"], [xs, y1, "1"]]) {
      svg.append(s("circle", { cx: x, cy: y, r: 13, class: "c6-no" }), s("text", { x, y: y + 1, "text-anchor": "middle", "dominant-baseline": "middle", class: "c6-no-rot" }, t));
    }
    svg.append(
      s("text", { x: xe, y: 16, "text-anchor": "middle", class: "c6-ramo-rot" }, "X enviado"),
      s("text", { x: xs, y: 16, "text-anchor": "middle", class: "c6-ramo-rot" }, "Y recebido"),
      s("text", { x: xe - 20, y: y0 + 4, "text-anchor": "end", class: "c6-ramo-rot" }, fmt(1 - q, 2)),
      s("text", { x: xe - 20, y: y1 + 4, "text-anchor": "end", class: "c6-ramo-rot" }, fmt(q, 2))
    );
    return svg;
  }

  function desenhar() {
    const p = pD.valor(), q = qD.valor();
    const conj = conjuntaBSC(q, p);
    const hx = entropiaBinaria(q), hxy = entropiaCondicionalXY(conj), I = informacaoMutua(conj), C = capacidadeBSC(p);
    placa.definir("hx", fmt(hx, 3));
    placa.definir("hxy", fmt(Math.max(0, hxy), 3));
    placa.definir("i", fmt(Math.max(0, I), 3));
    placa.definir("c", fmt(C, 3));
    trocar(esquema, desenharBSC(p, q));

    const lg = larguraUtil(g1, 460);
    const gi = grafico({ largura: lg, altura: 230, x: [0, 1], y: [0, 1], ticksX: [0, 0.25, 0.5, 0.75, 1], ticksY: [0, 0.5, 1], fmtX: (v) => fmt(v, 2), rotuloX: "q, fração de 1 enviados", rotuloY: "I(X;Y)", margem: { t: 14, r: 14, b: 42, l: 50 } });
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push([gi.x(i / 100), gi.y(Math.max(0, informacaoMutua(conjuntaBSC(i / 100, p))))]);
    gi.plot.append(
      s("line", { x1: gi.x(0), x2: gi.x(1), y1: gi.y(C), y2: gi.y(C), class: "referencia" }),
      s("text", { x: gi.x(1) - 4, y: gi.y(C) - 6, "text-anchor": "end", class: "anotacao" }, `C = ${fmt(C, 2)}`),
      s("path", { d: caminho(pts), class: "linha-dados" }),
      s("circle", { cx: gi.x(q), cy: gi.y(Math.max(0, I)), r: 6, class: "ponto" })
    );
    trocar(g1, gi.svg);

    const gc = grafico({ largura: lg, altura: 230, x: [0, 1], y: [0, 1], ticksX: [0, 0.25, 0.5, 0.75, 1], ticksY: [0, 0.5, 1], fmtX: (v) => fmt(v, 2), rotuloX: "p, probabilidade de troca", rotuloY: "C = 1 − h(p)", margem: { t: 14, r: 14, b: 42, l: 50 } });
    const ptc = [];
    for (let i = 0; i <= 200; i++) ptc.push([gc.x(i / 200), gc.y(capacidadeBSC(i / 200))]);
    gc.plot.append(s("path", { d: caminho(ptc), class: "linha-dados" }), s("circle", { cx: gc.x(p), cy: gc.y(C), r: 6, class: "ponto" }));
    trocar(g2, gc.svg);
  }
  const q0 = requestAnimationFrame(() => desenhar());
  return () => {
    cancelAnimationFrame(q0);
    desligar();
  };
}

// ---------------------------------------------------------------------------
// Códigos aleatórios: a ideia da prova
// ---------------------------------------------------------------------------
const TAXAS = [
  { R: 0.25, rot: "1/4", ns: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] },
  { R: 0.5, rot: "1/2", ns: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24] },
  { R: 0.75, rot: "3/4", ns: [4, 6, 8, 10, 12, 14, 16] },
];
const ENSAIOS = 800, POR_CODIGO = 40;

function aleatorios(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Códigos sorteados ao acaso",
    legenda: [
      "Para cada comprimento de bloco n e cada taxa R, o programa sorteia códigos com ",
      h("span", "2", h("sup", "nR")),
      ` palavras de n bits (um código novo a cada ${POR_CODIGO} mensagens), manda ${ENSAIOS} mensagens pelo canal e decodifica cada uma pela palavra-código mais próxima. O eixo vertical é a fração de mensagens decodificadas erradas. Curvas verdes: taxa abaixo da capacidade. Vermelhas: acima.`,
    ],
  });
  const pD = deslizante({ id: "c6-ale-p", rotulo: "probabilidade de troca p", min: 0.01, max: 0.2, passo: 0.01, valor: 0.05, formato: (v) => fmtPct(v, 0), aoMudar: () => { clearTimeout(espera); espera = setTimeout(recomecar, 120); } });
  const placa = leituras([
    { chave: "c", rotulo: "capacidade C", valor: "—", destaque: true },
    { chave: "status", rotulo: "simulação", valor: "—" },
  ]);
  const grafo = h("div.rolagem");
  corpo.append(pD.el, h("div.linha", placa.el, botao("Sortear outros códigos", () => { semente++; recomecar(); }, { id: "c6-ale-sortear" })), grafo);

  let semente = 11, espera = null, timer = null, quadro = null, vivo = true;
  const desligar = aoRedimensionar(grafo, () => desenhar());
  let series = [], fila = [], rng = null, ultimoDesenho = 0;

  function recomecar() {
    clearTimeout(timer);
    rng = criarRng(semente * 7907);
    const p = pD.valor();
    series = TAXAS.map((t) => ({ ...t, pts: [] }));
    fila = [];
    for (const sr of series)
      for (const n of sr.ns) {
        const k = Math.max(1, Math.round(n * sr.R));
        if (k > 12) continue;
        const ponto = { n, k, erros: 0, feitos: 0, codigo: null };
        sr.pts.push(ponto);
        fila.push(ponto);
      }
    // intercalar: primeiro os blocos curtos de todas as taxas
    fila.sort((a, b) => a.n - b.n);
    placa.definir("c", fmt(capacidadeBSC(p), 2));
    desenhar();
    passo();
  }

  function passo() {
    if (!vivo) return;
    const p = pD.valor();
    const t0 = performance.now();
    while (fila.length && performance.now() - t0 < 14) {
      const pt = fila[0];
      for (let j = 0; j < 10 && pt.feitos < ENSAIOS; j++) {
        if (pt.feitos % POR_CODIGO === 0) pt.codigo = codigoAleatorio(pt.n, 2 ** pt.k, rng);
        if (envioAleatorio(pt.codigo, pt.n, p, rng)) pt.erros++;
        pt.feitos++;
      }
      if (pt.feitos >= ENSAIOS) {
        pt.codigo = null;
        fila.shift();
      }
    }
    // redesenha no máximo a cada 200 ms enquanto a simulação corre
    const agora = performance.now();
    if (!quadro && (agora - ultimoDesenho > 200 || !fila.length)) quadro = requestAnimationFrame(() => { quadro = null; ultimoDesenho = performance.now(); desenhar(); });
    if (fila.length) timer = setTimeout(passo, 0);
  }

  function desenhar() {
    const p = pD.valor(), C = capacidadeBSC(p);
    const total = series.reduce((a, sr) => a + sr.pts.length, 0);
    const prontos = series.reduce((a, sr) => a + sr.pts.filter((q) => q.feitos >= ENSAIOS).length, 0);
    placa.definir("status", prontos < total ? `${prontos} de ${total} pontos` : "pronta");
    const g = grafico({
      largura: larguraUtil(grafo), altura: 300, x: [0, 30], y: [0, 1],
      ticksX: [0, 5, 10, 15, 20, 25, 30], ticksY: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => fmtPct(v, 0),
      rotuloX: "n, comprimento do bloco em bits", rotuloY: "mensagens erradas", margem: { t: 16, r: 62, b: 46, l: 58 },
    });
    for (const sr of series) {
      const feitos = sr.pts.filter((q) => q.feitos >= ENSAIOS);
      if (!feitos.length) continue;
      const classe = sr.R < C ? "c6-abaixo" : "c6-acima";
      const xy = feitos.map((q) => [g.x(q.n), g.y(q.erros / q.feitos)]);
      g.plot.append(s("path", { d: caminho(xy), class: "c6-serie " + classe }));
      for (const q of feitos) g.plot.append(s("circle", { cx: g.x(q.n), cy: g.y(q.erros / q.feitos), r: 3.5, class: "c6-serie-ponto " + classe }, s("title", {}, `R = ${sr.rot}, n = ${q.n}: ${fmtPct(q.erros / q.feitos, 1)} das mensagens erradas`)));
      const ult = xy.at(-1);
      g.plot.append(s("text", { x: ult[0] + 7, y: ult[1] + 4, class: "anotacao-dados " + classe }, `R = ${sr.rot}`));
    }
    trocar(grafo, g.svg);
  }

  timer = setTimeout(recomecar, 0);
  return () => {
    vivo = false;
    desligar();
    clearTimeout(timer);
    clearTimeout(espera);
    if (quadro) cancelAnimationFrame(quadro);
  };
}
