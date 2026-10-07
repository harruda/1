// Capítulo 3 — A média da surpresa
import { h, s, trocar, moldura, botao, seletor, leituras, deslizante, avisoModelo, grafico, caminho, fmt, fmtInt, fmtPct, semMovimento } from "../assets/nucleo/ui.js";
import { ALFABETO, K, rotulo } from "../assets/nucleo/alfabeto.js";
import { obterModelo } from "../assets/nucleo/modelo.js";
import { entropia, entropiaBinaria, huffman } from "../assets/nucleo/info.js";

export async function montar(raiz) {
  const limpar = [];
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const w = fig.dataset.widget;
    if (w === "distribuicao") limpar.push(distribuicao(fig));
    if (w === "binaria") limpar.push(binaria(fig));
    if (w === "letras") limpar.push(letras(fig));
    if (w === "condicional") limpar.push(condicional(fig));
    if (w === "agrupamento") limpar.push(agrupamento(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// ---------------------------------------------------------------------------
// Lógica pura (testada em testes/c3.test.mjs)
// ---------------------------------------------------------------------------

/** Surpresa em bits; ∞ para p = 0. */
const surp = (p) => (p > 0 ? Math.log2(1 / p) : Infinity);

/** Parcela p·log₂(1/p) da entropia (0 quando p = 0). */
export const parcela = (p) => (p > 0 ? p * Math.log2(1 / p) : 0);

/**
 * Fixa p[i] = v e reescala os demais para que a soma continue 1.
 * Se os demais somam zero, o resto é dividido igualmente entre eles.
 */
export function redistribuir(p, i, v) {
  v = Math.min(1, Math.max(0, v));
  const resto = p.reduce((a, x, j) => (j === i ? a : a + x), 0);
  const n = p.length;
  return p.map((x, j) => (j === i ? v : resto > 1e-12 ? (x * (1 - v)) / resto : (1 - v) / (n - 1)));
}

/** Número médio de perguntas de sim ou não da melhor estratégia (código de Huffman). */
export function perguntasMedias(p) {
  const itens = p.map((peso, simbolo) => ({ simbolo, peso })).filter((x) => x.peso > 1e-12);
  if (itens.length <= 1) return 0;
  const { codigos } = huffman(itens);
  return itens.reduce((a, x) => a + x.peso * codigos.get(x.simbolo).length, 0);
}

/** Medidas candidatas de incerteza (para o interativo do agrupamento). */
export const MEDIDAS = {
  shannon: { nome: "H", rotulo: "Shannon: Σ p·log₂(1/p)", f: (p) => entropia(p) },
  gini: { nome: "G", rotulo: "Gini–Simpson: 1 − Σ p²", f: (p) => 1 - p.reduce((a, x) => a + x * x, 0) },
  hartley: { nome: "H₀", rotulo: "Hartley: log₂ (nº de resultados)", f: (p) => Math.log2(p.filter((x) => x > 0).length || 1) },
};

/**
 * Escolha entre A, B, C feita em uma etapa ou em duas: primeiro A contra "B ou C"
 * (probabilidade pA), depois B contra C (fração q do resto).
 */
export function agrupar(f, pA, q) {
  const pB = (1 - pA) * q, pC = (1 - pA) * (1 - q);
  const umaEtapa = f([pA, pB, pC]);
  const primeira = f([pA, 1 - pA]);
  const segunda = f([q, 1 - q]);
  const duasEtapas = primeira + (1 - pA) * segunda;
  return { p: [pA, pB, pC], umaEtapa, primeira, segunda, peso: 1 - pA, duasEtapas };
}

/** Entropia (bits) de um vetor de contagens. */
export function entropiaContagens(c) {
  let tot = 0;
  for (const x of c) tot += x;
  if (!tot) return 0;
  let H = 0;
  for (const x of c) if (x > 0) H -= (x / tot) * Math.log2(x / tot);
  return H;
}

/**
 * Estatísticas de pares de letras consecutivas a partir da matriz de contagens
 * (pares[x][y] = quantas vezes y veio logo depois de x).
 * Devolve H(X), H(Y), H(X,Y), H(Y|X) e, por letra, { n, p, H } com H = H(Y | X = x).
 */
export function estatisticasPares(pares) {
  const k = pares.length;
  const nx = pares.map((l) => l.reduce((a, b) => a + b, 0));
  const ny = new Array(k).fill(0);
  for (const l of pares) l.forEach((c, y) => (ny[y] += c));
  const M = nx.reduce((a, b) => a + b, 0);
  let HXY = 0;
  for (const l of pares) for (const c of l) if (c > 0) HXY -= (c / M) * Math.log2(c / M);
  const linhas = pares.map((l, x) => ({ x, n: nx[x], p: nx[x] / M, H: entropiaContagens(l) }));
  const HYdX = linhas.reduce((a, r) => a + r.p * r.H, 0);
  return { M, HX: entropiaContagens(nx), HY: entropiaContagens(ny), HXY, HYdX, linhas };
}

// ---------------------------------------------------------------------------
// Dados de Machado: contagens de letras e de pares, uma vez só.
// ---------------------------------------------------------------------------
let promessaDados = null;
function dadosMachado() {
  if (!promessaDados) {
    promessaDados = obterModelo().then((m) => {
      const freq = Array.from(m.contagens([], 0));
      const pares = ALFABETO.split("").map((_, x) => Array.from(m.contagens([x], 1)));
      const N = freq.reduce((a, b) => a + b, 0);
      return { freq, N, H1: entropiaContagens(freq), pares, est: estatisticasPares(pares) };
    });
    promessaDados.catch(() => (promessaDados = null));
  }
  return promessaDados;
}

// Converte coordenadas do ponteiro em coordenadas do SVG.
function pontoSVG(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

const LETRAS_ROTULO = "ABCDEFGH";
/** Barrinha horizontal dentro de um trilho (largura em %). */
const trilho = (pct, cls = "") => h("span.c3-trilho", h("span.c3-barrinha" + cls, { style: { width: Math.max(0, Math.min(100, pct)) + "%" } }));
const fmtSurp = (p) => (p > 0 ? fmt(surp(p), 2) : "∞");

// ---------------------------------------------------------------------------
// 1. Editor de distribuição: a média ponderada das surpresas
// ---------------------------------------------------------------------------
function distribuicao(fig) {
  const { corpo } = moldura(fig, {
    titulo: "A média das surpresas",
    legenda:
      "Arraste as barras, ou selecione uma com Tab e use as setas, para mudar as probabilidades; as outras se ajustam para que a soma continue 1. A faixa amarela empilha as parcelas p·log₂(1/p): o seu comprimento total é a entropia. A linha tracejada marca o teto log₂ n.",
  });

  const dado = ["1", "2", "3", "4", "5", "6"];
  const PRONTAS = {
    honesta: { rotulo: "moeda honesta", nomes: ["cara", "coroa"], p: [0.5, 0.5] },
    viciada: { rotulo: "moeda viciada", nomes: ["cara", "coroa"], p: [0.9, 0.1] },
    dado: { rotulo: "dado", nomes: dado, p: Array(6).fill(1 / 6) },
    dadoV: { rotulo: "dado viciado", nomes: dado, p: [0.1, 0.1, 0.1, 0.1, 0.1, 0.5] },
    quase: { rotulo: "quase certa", nomes: ["A", "B", "C", "D"], p: [0.97, 0.01, 0.01, 0.01] },
    metades: { rotulo: "½ ¼ ⅛ ⅛", nomes: ["1", "2", "3", "4"], p: [0.5, 0.25, 0.125, 0.125] },
  };
  let nomes = [], p = [];

  const sel = seletor(
    Object.entries(PRONTAS).map(([valor, o]) => ({ valor, rotulo: o.rotulo })),
    "dadoV",
    (v) => carregar(v),
    { id: "c3-dist-prontas", rotuloAria: "Distribuições prontas" }
  );
  const btMenos = botao("− resultado", () => mudarN(-1), { id: "c3-dist-menos" });
  const btMais = botao("+ resultado", () => mudarN(+1), { id: "c3-dist-mais" });
  const btUniforme = botao("Uniforme", () => {
    p = p.map(() => 1 / p.length);
    sel.definir(null);
    atualizar();
  }, { id: "c3-dist-uniforme" });

  const colunas = h("div.c3-dist-colunas");
  const pilha = h("div.c3-pilha");
  const escalaPilha = h("div.c3-pilha-escala", { "aria-hidden": "true" });
  const conta = h("p.c3-conta");
  const placa = leituras([
    { chave: "H", rotulo: "entropia H", valor: "—", destaque: true },
    { chave: "teto", rotulo: "teto log₂ n", valor: "—" },
    { chave: "perg", rotulo: "perguntas, em média", valor: "—" },
  ]);
  corpo.append(
    sel.el,
    colunas,
    h("p.c3-nota-colunas", "Sob cada barra: o resultado, a sua probabilidade e a sua surpresa em bits."),
    h("div.linha", btMenos, btMais, btUniforme),
    h("div", h("span.c3-rotulo-campo", "Parcelas p·log₂(1/p), empilhadas (bits)"), pilha, escalaPilha),
    conta,
    placa.el
  );

  const ESC = 3; // a pilha vai de 0 a log₂ 8 = 3 bits
  for (let b = 0; b <= ESC; b++) escalaPilha.append(h("span", { style: { left: (100 * b) / ESC + "%" } }, String(b)));

  let cols = [];
  function construir() {
    cols = p.map((_, i) => {
      const barra = h("div.c3-dist-barra");
      const trilho = h("div.c3-dist-trilho", barra);
      const vp = h("div.c3-dist-p");
      const vs = h("div.c3-dist-s");
      const nome = h("div.c3-dist-nome");
      const col = h(
        "div.c3-dist-col",
        { id: `c3-dist-col-${i}`, tabindex: 0, role: "slider", "aria-valuemin": 0, "aria-valuemax": 100 },
        trilho,
        nome,
        vp,
        vs
      );
      const arrastar = (ev) => {
        const r = trilho.getBoundingClientRect();
        const v = 1 - (ev.clientY - r.top) / r.height;
        definir(i, Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000);
      };
      trilho.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        trilho.setPointerCapture(ev.pointerId);
        col.focus({ preventScroll: true });
        arrastar(ev);
      });
      trilho.addEventListener("pointermove", (ev) => {
        if (trilho.hasPointerCapture(ev.pointerId)) arrastar(ev);
      });
      col.addEventListener("keydown", (ev) => {
        const passos = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 };
        let v = null;
        if (ev.key in passos) v = p[i] + passos[ev.key];
        else if (ev.key === "Home") v = 0;
        else if (ev.key === "End") v = 1;
        if (v == null) return;
        ev.preventDefault();
        definir(i, Math.round(Math.min(1, Math.max(0, v)) * 100) / 100);
      });
      return { col, barra, vp, vs, nome };
    });
    trocar(colunas, cols.map((c) => c.col));
    colunas.style.setProperty("--n", p.length);
    btMenos.disabled = p.length <= 2;
    btMais.disabled = p.length >= 8;
  }

  function definir(i, v) {
    p = redistribuir(p, i, v);
    sel.definir(null);
    atualizar();
  }

  function mudarN(d) {
    const n = p.length + d;
    if (n < 2 || n > 8) return;
    if (d > 0) {
      p = [...p.map((x) => (x * (n - 1)) / n), 1 / n];
      const numericos = nomes.every((x) => /^\d$/.test(x));
      nomes = numericos ? [...nomes, String(n)] : LETRAS_ROTULO.slice(0, n).split("");
    } else {
      p = p.slice(0, -1);
      const t = p.reduce((a, b) => a + b, 0);
      p = t > 0 ? p.map((x) => x / t) : p.map(() => 1 / n);
      nomes = nomes.slice(0, -1);
    }
    sel.definir(null);
    construir();
    atualizar();
  }

  function carregar(chave) {
    const o = PRONTAS[chave];
    nomes = [...o.nomes];
    p = [...o.p];
    construir();
    atualizar();
  }

  function atualizar() {
    const n = p.length;
    const H = entropia(p);
    cols.forEach((c, i) => {
      c.barra.style.height = 100 * p[i] + "%";
      c.nome.textContent = nomes[i];
      c.vp.textContent = fmtPct(p[i], 0);
      c.vs.textContent = fmtSurp(p[i]);
      c.col.setAttribute("aria-valuenow", Math.round(100 * p[i]));
      c.col.setAttribute("aria-valuetext", `${nomes[i]}: ${fmtPct(p[i], 0)}, surpresa ${fmtSurp(p[i])} bits`);
      c.col.setAttribute("aria-label", `Probabilidade de ${nomes[i]}`);
    });
    // pilha das parcelas
    const segs = p.map((x, i) => {
      const c = parcela(x);
      const larg = (100 * c) / ESC;
      return h(
        "div.c3-pilha-seg" + (i % 2 ? ".alt" : ""),
        { style: { width: larg + "%" }, title: `${nomes[i]}: ${fmt(x, 3)} × ${fmtSurp(x)} = ${fmt(c, 3)} bit` },
        larg > 7 ? nomes[i] : ""
      );
    });
    const teto = Math.log2(n);
    trocar(pilha, segs, h("div.c3-pilha-teto", { style: { left: (100 * teto) / ESC + "%" }, title: `log₂ ${n} = ${fmt(teto, 2)}` }));
    // a média ponderada escrita por extenso
    const termos = p
      .map((x, i) => (x > 0 ? h("span.c3-termo", `${fmt(x, 2)} × ${fmtSurp(x)}`) : null))
      .filter(Boolean);
    const partes = [];
    termos.forEach((t, i) => partes.push(i ? " + " : "", t));
    trocar(conta, h("span", "H = "), partes, h("span", " = "), h("strong", fmt(H, 2) + (Math.abs(H - 1) < 0.005 ? " bit" : " bits")));
    placa.definir("H", fmt(H, 3));
    placa.definir("teto", fmt(teto, 3));
    placa.definir("perg", fmt(perguntasMedias(p), 3));
  }

  carregar("dadoV");
  return () => {};
}

// ---------------------------------------------------------------------------
// 2. A curva h(p) e uma moeda lançada muitas vezes
// ---------------------------------------------------------------------------
function binaria(fig) {
  const { corpo } = moldura(fig, {
    titulo: "A moeda viciada · entropia binária",
    legenda:
      "Arraste o ponto sobre a curva ou use o controle. Cada lançamento aparece como um círculo (cheio para cara, vazado para coroa) pintado de amarelo conforme a sua surpresa. No segundo gráfico, a surpresa média de todos os lançamentos até ali, comparada com h(p).",
  });
  let p = 0.9;
  let n = 0, caras = 0, soma = 0, alvo = 0, ritmo = 10, quadro = null;
  let medias = []; // surpresa média após cada lançamento
  let ultimos = []; // últimos lançamentos (true = cara)

  const curvaBox = h("div.c3-bin-curva");
  const ctl = deslizante({
    id: "c3-bin-p",
    rotulo: "probabilidade de cara",
    min: 0,
    max: 1,
    passo: 0.01,
    valor: p,
    formato: (v) => fmtPct(v, 0),
    aoMudar: (v) => mudarP(v, false),
  });
  const fileira = h("div.c3-moedas", { "aria-label": "Últimos lançamentos" });
  const convBox = h("div.c3-bin-conv");
  const placa = leituras([
    { chave: "n", rotulo: "lançamentos", valor: "0" },
    { chave: "caras", rotulo: "caras", valor: "—" },
    { chave: "media", rotulo: "surpresa média", valor: "—", destaque: true },
    { chave: "h", rotulo: "h(p)", valor: "—" },
  ]);
  const bt1 = botao("Lançar 1", () => lancar(1), { id: "c3-bin-um" });
  const bt1000 = botao("Lançar 1.000", () => lancar(1000), { variante: "primario", id: "c3-bin-mil" });
  const btZerar = botao("Zerar", () => zerar(), { variante: "discreto", id: "c3-bin-zerar" });

  corpo.append(
    h("div.c3-bin-grade", h("div", curvaBox, ctl.el), h("div.c3-bin-direita", h("div.linha", bt1, bt1000, btZerar), fileira, convBox)),
    placa.el
  );

  // --- gráfico da curva, desenhado uma vez; o ponto se move
  const g = grafico({
    largura: 420, altura: 300, x: [0, 1], y: [0, 1.08],
    ticksX: [0, 0.25, 0.5, 0.75, 1], ticksY: [0, 0.25, 0.5, 0.75, 1],
    fmtX: (v) => (v === 0 || v === 1 ? String(v) : fmt(v, 2)),
    fmtY: (v) => (v === 0 || v === 1 ? String(v) : fmt(v, 2)),
    rotuloX: "p, probabilidade de cara", rotuloY: "h(p), em bits",
    margem: { t: 16, r: 16, b: 44, l: 64 },
  });
  const pts = [];
  for (let i = 0; i <= 200; i++) pts.push([g.x(i / 200), g.y(entropiaBinaria(i / 200))]);
  const guiaV = s("line", { class: "referencia" });
  const guiaH = s("line", { class: "referencia" });
  const ponto = s("circle", { r: 7, class: "ponto c3-ponto" });
  const rotuloPonto = s("text", { class: "anotacao-dados", "text-anchor": "middle" });
  const alvoToque = s("rect", {
    x: g.x(0) - 8, y: g.y(1.08), width: g.x(1) - g.x(0) + 16, height: g.y(0) - g.y(1.08) + 8,
    class: "c3-toque",
  });
  g.plot.append(
    s("path", { d: caminho([[g.x(0), g.y(0)], ...pts, [g.x(1), g.y(0)]]), class: "area-dados" }),
    s("path", { d: caminho(pts), class: "linha-dados" }),
    guiaV, guiaH, ponto, rotuloPonto, alvoToque
  );
  g.svg.setAttribute("aria-label", "Curva da entropia binária h(p)");
  curvaBox.append(g.svg);

  const deX = (ev) => Math.round(Math.min(1, Math.max(0, g.x.inv(pontoSVG(g.svg, ev).x))) * 100) / 100;
  alvoToque.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    alvoToque.setPointerCapture(ev.pointerId);
    mudarP(deX(ev), true);
  });
  alvoToque.addEventListener("pointermove", (ev) => {
    if (alvoToque.hasPointerCapture(ev.pointerId)) mudarP(deX(ev), true);
  });

  function desenharPonto() {
    const hp = entropiaBinaria(p);
    const cx = g.x(p), cy = g.y(hp);
    ponto.setAttribute("cx", cx);
    ponto.setAttribute("cy", cy);
    guiaV.setAttribute("x1", cx); guiaV.setAttribute("x2", cx); guiaV.setAttribute("y1", cy); guiaV.setAttribute("y2", g.y(0));
    guiaH.setAttribute("x1", g.x(0)); guiaH.setAttribute("x2", cx); guiaH.setAttribute("y1", cy); guiaH.setAttribute("y2", cy);
    rotuloPonto.setAttribute("x", Math.min(Math.max(cx, g.x(0) + 40), g.x(1) - 40));
    rotuloPonto.setAttribute("y", cy - 14);
    rotuloPonto.textContent = `h = ${fmt(hp, 3)}`;
    placa.definir("h", fmt(hp, 3));
  }

  function mudarP(v, doGrafico) {
    if (v === p) return;
    p = v;
    if (doGrafico) ctl.definir(v, false);
    desenharPonto();
    zerar();
  }

  function zerar() {
    cancelAnimationFrame(quadro);
    quadro = null;
    n = 0; caras = 0; soma = 0; alvo = 0;
    medias = [];
    ultimos = [];
    desenharMoedas();
  }

  function umLancamento() {
    const cara = Math.random() < p;
    n++;
    if (cara) caras++;
    soma += surp(cara ? p : 1 - p);
    medias.push(soma / n);
    ultimos.push(cara);
    if (ultimos.length > 120) ultimos.shift();
  }

  function lancar(k) {
    alvo = Math.min(n + k, 200000);
    if (k === 1 || semMovimento()) {
      while (n < alvo) umLancamento();
      desenharMoedas();
      return;
    }
    ritmo = Math.max(10, Math.ceil(k / 50)); // cerca de 50 quadros, menos de um segundo
    if (quadro) return;
    const passo = () => {
      const lote = ritmo;
      for (let i = 0; i < lote && n < alvo; i++) umLancamento();
      desenharMoedas();
      quadro = n < alvo ? requestAnimationFrame(passo) : null;
    };
    quadro = requestAnimationFrame(passo);
  }

  const TETO = 4; // surpresa (bits) que satura o marca-texto
  function desenharMoedas() {
    const sc = surp(p), sk = surp(1 - p);
    trocar(
      fileira,
      ultimos.length
        ? ultimos.map((cara) =>
            h("span.c3-moeda" + (cara ? ".cara" : ".coroa"), {
              style: { "--s": Math.min(1, (cara ? sc : sk) / TETO).toFixed(3) },
              title: `${cara ? "cara" : "coroa"}: ${fmt(cara ? sc : sk, 2)} bits`,
            })
          )
        : h("span.c3-moedas-vazio", "Nenhum lançamento ainda.")
    );
    placa.definir("n", fmtInt(n));
    placa.definir("caras", n ? `${fmtInt(caras)} (${fmtPct(caras / n, 1)})` : "—");
    placa.definir("media", n ? fmt(soma / n, 3) : "—");
    desenharConvergencia();
  }

  function desenharConvergencia() {
    const hp = entropiaBinaria(p);
    const xmax = Math.max(100, n);
    const ymax = Math.max(1.2, Math.min(3, hp + 0.6));
    const gc = grafico({
      largura: 420, altura: 220, x: [0, xmax], y: [0, ymax],
      fmtX: (v) => fmtInt(v), rotuloX: "número de lançamentos", rotuloY: "surpresa média (bits)",
      margem: { t: 16, r: 16, b: 44, l: 54 },
    });
    gc.svg.setAttribute("aria-label", "Surpresa média em função do número de lançamentos");
    gc.plot.append(
      s("line", { x1: gc.x(0), x2: gc.x(xmax), y1: gc.y(hp), y2: gc.y(hp), class: "referencia" }),
      s("text", { x: gc.x(xmax) - 4, y: gc.y(hp) + 16, class: "anotacao", "text-anchor": "end" }, `h(p) = ${fmt(hp, 3)}`)
    );
    if (n) {
      const passo = Math.max(1, Math.floor(n / 400));
      const linha = [];
      for (let i = 0; i < n; i += passo) linha.push([gc.x(i + 1), gc.y(Math.min(medias[i], ymax))]);
      linha.push([gc.x(n), gc.y(Math.min(medias[n - 1], ymax))]);
      gc.plot.append(s("path", { d: caminho(linha), class: "linha-dados c3-linha-media" }));
    }
    trocar(convBox, gc.svg);
  }

  desenharPonto();
  desenharMoedas();
  return () => cancelAnimationFrame(quadro);
}

// ---------------------------------------------------------------------------
// 3. As letras de Machado, contadas uma a uma
// ---------------------------------------------------------------------------
function letras(fig) {
  const { corpo } = moldura(fig, {
    titulo: "As 39 letras de Machado",
    legenda:
      "Frequência de cada símbolo nos nove romances (␣ é o espaço), a surpresa log₂(1/p) que ele causa e a sua parcela p·log₂(1/p) na entropia. A faixa de baixo empilha as 39 parcelas: o comprimento total é H₁.",
  });
  let vivo = true;
  let todas = false;
  const tabela = h("div.c3-letras", { role: "table", "aria-label": "Frequências e parcelas da entropia" });
  const btTodas = botao("Mostrar as 39 letras", () => {
    todas = !todas;
    btTodas.textContent = todas ? "Mostrar só as 12 mais comuns" : "Mostrar as 39 letras";
    desenhar();
  }, { variante: "discreto", id: "c3-letras-todas" });
  const pilha = h("div.c3-pilha.c3-pilha-letras");
  const escala = h("div.c3-pilha-escala", { "aria-hidden": "true" });
  const placa = leituras([
    { chave: "N", rotulo: "letras contadas", valor: "—" },
    { chave: "H1", rotulo: "entropia H₁", valor: "—", destaque: true },
    { chave: "teto", rotulo: "teto log₂ 39", valor: fmt(Math.log2(K), 3) },
    { chave: "dif", rotulo: "abaixo do teto", valor: "—" },
  ]);
  const conteudo = h("div.interativo-corpo", placa.el, tabela, h("div.linha", btTodas), h("div", h("span.c3-rotulo-campo", "As 39 parcelas empilhadas (bits)"), pilha, escala));
  conteudo.hidden = true;
  corpo.append(conteudo);
  avisoModelo(corpo);

  const ESC = 5.5;
  for (let b = 0; b <= 5; b++) escala.append(h("span", { style: { left: (100 * b) / ESC + "%" } }, String(b)));

  let dados = null;
  function desenhar() {
    const { freq, N, H1 } = dados;
    const linhas = freq.map((c, i) => ({ i, p: c / N })).sort((a, b) => b.p - a.p);
    const pmax = linhas[0].p;
    const cmax = Math.max(...linhas.map((l) => parcela(l.p)));
    const mostrar = todas ? linhas : linhas.slice(0, 12);
    const cab = h(
      "div.c3-letras-linha.c3-letras-cab",
      { role: "row" },
      h("span", { role: "columnheader" }, ""),
      h("span", { role: "columnheader" }, "frequência"),
      h("span", { role: "columnheader" }, "surpresa"),
      h("span", { role: "columnheader" }, "parcela")
    );
    const corpoT = mostrar.map((l) => {
      const c = parcela(l.p);
      return h(
        "div.c3-letras-linha",
        { role: "row" },
        h("span.c3-letra", { role: "cell" }, rotulo(l.i)),
        h("span.c3-celula", { role: "cell" }, trilho((100 * l.p) / pmax), h("span.c3-num", fmtPct(l.p, l.p < 0.001 ? 3 : 1))),
        h("span.c3-num.c3-surp", { role: "cell" }, fmt(surp(l.p), 2)),
        h("span.c3-celula", { role: "cell" }, trilho((100 * c) / cmax, ".marca"), h("span.c3-num", fmt(c, 3)))
      );
    });
    let resumo = null;
    if (!todas) {
      const resto = linhas.slice(12);
      const pr = resto.reduce((a, l) => a + l.p, 0);
      const cr = resto.reduce((a, l) => a + parcela(l.p), 0);
      resumo = h(
        "div.c3-letras-linha.c3-letras-resto",
        { role: "row" },
        h("span.c3-letra", { role: "cell" }, "…"),
        h("span.c3-num", { role: "cell" }, `outras ${resto.length}: ${fmtPct(pr, 1)}`),
        h("span", { role: "cell" }, ""),
        h("span.c3-num", { role: "cell" }, `${fmt(cr, 3)} no total`)
      );
    }
    trocar(tabela, cab, corpoT, resumo);

    // faixa empilhada
    let k = 0;
    const segs = linhas.map((l) => {
      const c = parcela(l.p);
      const larg = (100 * c) / ESC;
      return h("div.c3-pilha-seg" + (k++ % 2 ? ".alt" : ""), { style: { width: larg + "%" }, title: `${rotulo(l.i)}: ${fmt(c, 4)} bit` }, larg > 4.5 ? rotulo(l.i) : "");
    });
    trocar(
      pilha,
      segs,
      h("div.c3-pilha-teto", { style: { left: (100 * Math.log2(K)) / ESC + "%" }, title: `log₂ 39 = ${fmt(Math.log2(K), 2)}` })
    );
    placa.definir("N", fmtInt(N));
    placa.definir("H1", fmt(H1, 3));
    placa.definir("dif", fmt(Math.log2(K) - H1, 3));
  }

  dadosMachado()
    .then((d) => {
      if (!vivo) return;
      dados = d;
      conteudo.hidden = false;
      desenhar();
    })
    .catch(() => {});
  return () => (vivo = false);
}

// ---------------------------------------------------------------------------
// 4. Entropia condicional: a letra seguinte, sabendo a atual
// ---------------------------------------------------------------------------
function condicional(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Depois de cada letra · entropia condicional",
    legenda:
      "Toque numa letra para ver o que vem depois dela nos nove romances. O amarelo de cada tecla mostra H(Y | X = x): quanto mais forte, mais dúvida sobre a letra seguinte. Os rankings deixam de fora w, k e y, que aparecem menos de 500 vezes.",
  });
  let vivo = true;
  let atual = ALFABETO.indexOf("q");
  let dados = null;

  const teclado = h("div.c3-teclado", { role: "group", "aria-label": "Escolha a letra atual" });
  const fileiras = ["abcdefghijklm", "nopqrstuvwxyz", "áàâãéêíóôõúç", " "];
  const teclas = new Map();
  for (const f of fileiras) {
    teclado.append(
      h(
        "div.c3-teclado-fileira",
        [...f].map((c) => {
          const i = ALFABETO.indexOf(c);
          const b = h("button.c3-tecla" + (c === " " ? ".espaco" : ""), { type: "button", id: `c3-tecla-${i}`, "aria-pressed": "false", on: { click: () => escolher(i) } }, c === " " ? "espaço" : c);
          teclas.set(i, b);
          return b;
        })
      )
    );
  }
  const titulo = h("p.c3-cond-titulo");
  const barras = h("div.c3-seguintes");
  const placa = leituras([
    { chave: "H", rotulo: "H(Y | X = x)", valor: "—", destaque: true },
    { chave: "n", rotulo: "ocorrências", valor: "—" },
    { chave: "contrib", rotulo: "p(x)·H(Y | X = x)", valor: "—" },
  ]);
  const ranking = h("div.c3-ranking");
  const cadeia = h("div.c3-cadeia");
  const conteudo = h(
    "div.interativo-corpo",
    h("div.c3-cond-grade", teclado, h("div.c3-cond-detalhe", titulo, placa.el, barras)),
    ranking,
    h("div", h("span.c3-rotulo-campo", "A regra da cadeia, com as contas feitas"), cadeia)
  );
  conteudo.hidden = true;
  corpo.append(conteudo);
  avisoModelo(corpo);

  function escolher(i) {
    atual = i;
    for (const [j, b] of teclas) b.setAttribute("aria-pressed", String(j === i));
    desenharDetalhe();
  }

  function desenharDetalhe() {
    const { pares, est } = dados;
    const lin = est.linhas[atual];
    const cont = pares[atual];
    const tot = lin.n;
    titulo.replaceChildren("Depois de ", h("span.c3-letra-grande", rotulo(atual)), `, a próxima letra é…`);
    placa.definir("H", fmt(lin.H, 3) + " bits");
    placa.definir("n", fmtInt(tot));
    placa.definir("contrib", `${fmt(lin.p, 4)} × ${fmt(lin.H, 2)} = ${fmt(lin.p * lin.H, 3)}`);
    const ordem = cont.map((c, y) => ({ y, q: c / (tot || 1) })).filter((o) => o.q > 0).sort((a, b) => b.q - a.q);
    const mostrar = ordem.slice(0, 8);
    const resto = ordem.slice(8).reduce((a, o) => a + o.q, 0);
    const restoN = ordem.length - mostrar.length;
    trocar(
      barras,
      mostrar.map((o) =>
        h(
          "div.c3-seg-linha",
          h("span.c3-letra", rotulo(o.y)),
          trilho(100 * o.q),
          h("span.c3-num", fmtPct(o.q, o.q < 0.001 ? 2 : 1))
        )
      ),
      restoN > 0
        ? h(
            "div.c3-seg-linha.c3-letras-resto",
            h("span.c3-letra", "…"),
            trilho(100 * resto),
            h("span.c3-num", `${fmtPct(resto, resto < 0.001 ? 2 : 1)} em ${restoN} outras`)
          )
        : null
    );
    // contribuição da letra escolhida na faixa da regra da cadeia
    for (const seg of cadeia.querySelectorAll("[data-x]")) seg.classList.toggle("escolhida", +seg.dataset.x === atual);
  }

  function desenharFixos() {
    const { est } = dados;
    const maxH = Math.max(...est.linhas.map((l) => l.H));
    for (const [i, b] of teclas) {
      const l = est.linhas[i];
      const sv = l.H / maxH;
      b.style.setProperty("--s", sv.toFixed(3));
      b.classList.toggle("forte", sv > 0.55);
      b.title = `depois de ${rotulo(i)}: ${fmt(l.H, 2)} bits`;
    }
    // rankings
    const validas = est.linhas.filter((l) => l.n >= 500);
    const asc = [...validas].sort((a, b) => a.H - b.H);
    const lista = (ls) =>
      h(
        "ol.c3-rank-lista",
        ls.map((l) =>
          h("li", h("button.c3-rank-bt", { type: "button", id: `c3-rank-${l.x}`, on: { click: () => escolher(l.x) } }, h("span.c3-letra", rotulo(l.x)), h("span.c3-num", fmt(l.H, 2) + " bits")))
        )
      );
    trocar(
      ranking,
      h("div", h("span.c3-rotulo-campo", "Menor incerteza"), lista(asc.slice(0, 6))),
      h("div", h("span.c3-rotulo-campo", "Maior incerteza"), lista(asc.slice(-6).reverse()))
    );
    // regra da cadeia
    const ESC = 8.6;
    const faixa = (rot, segs, valor) =>
      h("div.c3-cadeia-linha", h("span.c3-cadeia-rot", rot), h("div.c3-cadeia-trilho", segs), h("span.c3-num", fmt(valor, 3)));
    const seg = (v, cls, extra = {}) => h("div.c3-cadeia-seg" + cls, { style: { width: (100 * v) / ESC + "%" }, ...extra });
    // H(Y|X) desdobrada nas parcelas p(x)·H(Y|X=x), da maior para a menor
    const parcelas = [...est.linhas].sort((a, b) => b.p * b.H - a.p * a.H);
    const segsCond = parcelas.map((l, k) =>
      seg(l.p * l.H, ".cond" + (k % 2 ? ".alt" : ""), { "data-x": l.x, title: `${rotulo(l.x)}: ${fmt(l.p, 3)} × ${fmt(l.H, 2)} = ${fmt(l.p * l.H, 3)}` })
    );
    trocar(
      cadeia,
      faixa("H(X)", [seg(est.HX, ".x")], est.HX),
      faixa("+ H(Y | X)", [seg(est.HX, ".vazio"), ...segsCond], est.HYdX),
      faixa("= H(X, Y)", [seg(est.HXY, ".xy")], est.HXY),
      faixa("H(X) + H(Y)", [seg(est.HX, ".x"), seg(est.HY, ".y")], est.HX + est.HY),
      h(
        "p.c3-cadeia-texto",
        `${fmt(est.HX, 4)} + ${fmt(est.HYdX, 4)} = ${fmt(est.HX + est.HYdX, 4)} bits, e a entropia dos ${fmtInt(est.M)} pares contados diretamente dá ${fmt(est.HXY, 4)} bits. `,
        `Se as letras fossem independentes, o par custaria ${fmt(est.HX + est.HY, 2)} bits; a dependência entre vizinhas economiza ${fmt(est.HX + est.HY - est.HXY, 2)} bit. `,
        "Na segunda faixa, cada pedaço é a parcela p(x)·H(Y | X = x) de uma letra; a da letra escolhida aparece em destaque."
      )
    );
  }

  dadosMachado()
    .then((d) => {
      if (!vivo) return;
      dados = d;
      conteudo.hidden = false;
      desenharFixos();
      escolher(atual);
    })
    .catch(() => {});
  return () => (vivo = false);
}

// ---------------------------------------------------------------------------
// 5. Agrupamento: escolher em uma etapa ou em duas
// ---------------------------------------------------------------------------
function agrupamento(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Uma etapa ou duas · a exigência de agrupamento",
    legenda:
      "Na primeira árvore, a escolha entre A, B e C feita de uma vez. Na segunda, a mesma escolha em duas etapas: primeiro A contra “B ou C”, depois B contra C. As probabilidades finais são iguais nos dois lados. Uma boa medida de incerteza deveria dar o mesmo valor aos dois.",
  });
  const D = 120; // controles em múltiplos de 1/120: ½, ⅓, ⅔, ¼… são exatos
  let medida = "shannon";
  let pA = 60 / D, q = 80 / D;

  const selMedida = seletor(
    Object.entries(MEDIDAS).map(([valor, m]) => ({ valor, rotulo: m.rotulo })),
    medida,
    (v) => {
      medida = v;
      atualizar();
    },
    { id: "c3-agr-medida", rotuloAria: "Medida de incerteza" }
  );
  const fracao = (v) => fmt(v / D, 2);
  const ctlA = deslizante({ id: "c3-agr-a", rotulo: "1ª etapa: p(A)", min: 1, max: D - 1, passo: 1, valor: pA * D, formato: fracao, aoMudar: (v) => ((pA = v / D), atualizar()) });
  const ctlQ = deslizante({ id: "c3-agr-q", rotulo: "2ª etapa: B dentro de “B ou C”", min: 0, max: D, passo: 1, valor: q * D, formato: fracao, aoMudar: (v) => ((q = v / D), atualizar()) });
  const btShannon = botao("O exemplo de Shannon: ½, ⅓, ⅙", () => {
    ctlA.definir(60, false);
    ctlQ.definir(80, false);
    pA = 0.5;
    q = 80 / D;
    atualizar();
  }, { variante: "discreto", id: "c3-agr-exemplo" });

  const arv1 = h("div.c3-arvore");
  const arv2 = h("div.c3-arvore");
  const contas = h("div.c3-agr-contas");
  corpo.append(
    selMedida.el,
    h("div.c3-agr-controles", ctlA.el, ctlQ.el),
    h("div.linha", btShannon),
    h("div.c3-arvores", h("div", h("span.c3-rotulo-campo", "Em uma etapa"), arv1), h("div", h("span.c3-rotulo-campo", "Em duas etapas"), arv2)),
    contas
  );

  const no = (x, y, r = 5) => s("circle", { cx: x, cy: y, r, class: "c3-no" });
  const aresta = (x1, y1, x2, y2, txt, acima = true) => [
    s("line", { x1, y1, x2, y2, class: "c3-aresta" }),
    s("text", { x: (x1 + x2) / 2, y: (y1 + y2) / 2 + (acima ? -7 : 15), class: "anotacao-dados", "text-anchor": "middle" }, txt),
  ];
  const folha = (x, y, nome, pf) => [
    no(x, y, 6),
    s("text", { x: x + 12, y: y + 1, class: "c3-folha", "dominant-baseline": "middle" }, nome),
    s("text", { x: x + 28, y: y + 1, class: "anotacao-dados c3-folha-p", "dominant-baseline": "middle" }, fmt(pf, 2)),
  ];

  function desenharArvores(pv) {
    const [a, b, c] = pv;
    const svg1 = s("svg", { viewBox: "0 0 320 200", class: "grafico c3-arv-svg", role: "img", "aria-label": "Árvore da escolha em uma etapa" },
      no(30, 100, 6),
      aresta(30, 100, 220, 35, fmt(a, 2)),
      aresta(30, 100, 220, 100, fmt(b, 2)),
      aresta(30, 100, 220, 165, fmt(c, 2), false),
      folha(220, 35, "A", a), folha(220, 100, "B", b), folha(220, 165, "C", c)
    );
    const svg2 = s("svg", { viewBox: "0 0 320 200", class: "grafico c3-arv-svg", role: "img", "aria-label": "Árvore da escolha em duas etapas" },
      no(20, 90, 6),
      aresta(20, 90, 220, 30, fmt(pA, 2)),
      aresta(20, 90, 120, 140, fmt(1 - pA, 2), false),
      no(120, 140, 6),
      s("text", { x: 120, y: 128, class: "anotacao", "text-anchor": "middle" }, "B ou C"),
      aresta(120, 140, 220, 105, fmt(q, 2)),
      aresta(120, 140, 220, 175, fmt(1 - q, 2), false),
      folha(220, 30, "A", a), folha(220, 105, "B", b), folha(220, 175, "C", c)
    );
    trocar(arv1, svg1);
    trocar(arv2, svg2);
  }

  function atualizar() {
    const m = MEDIDAS[medida];
    const r = agrupar(m.f, pA, q);
    desenharArvores(r.p);
    const F = m.nome;
    const lista = (v) => v.map((x) => fmt(x, 2)).join("; ");
    const dif = r.umaEtapa - r.duasEtapas;
    const ok = Math.abs(dif) < 5e-4;
    trocar(
      contas,
      h("div.c3-agr-linha", h("span.c3-agr-rot", "uma etapa"), h("span.c3-agr-expr", h("span", `${F}(${lista(r.p)})`)), h("span.c3-agr-val", "= " + fmt(r.umaEtapa, 3))),
      h(
        "div.c3-agr-linha",
        h("span.c3-agr-rot", "duas etapas"),
        h("span.c3-agr-expr", h("span", `${F}(${lista([pA, 1 - pA])})`), " + ", h("span", `${fmt(r.peso, 2)} × ${F}(${lista([q, 1 - q])})`)),
        h("span.c3-agr-val", h("span", `= ${fmt(r.primeira, 3)}`), " + ", h("span", `${fmt(r.peso, 2)} × ${fmt(r.segunda, 3)}`), " ", h("span", `= ${fmt(r.duasEtapas, 3)}`))
      ),
      h(
        "p.c3-agr-veredito" + (ok ? ".certo" : ".errado"),
        ok ? "Os dois lados coincidem." : `Os dois lados diferem em ${fmt(Math.abs(dif), 3)}: esta medida depende de como a escolha é feita.`
      )
    );
  }

  atualizar();
  return () => {};
}
