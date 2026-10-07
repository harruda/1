// Capítulo 2 — Perguntas de sim ou não
import { h, s, trocar, moldura, botao, seletor, leituras, avisoModelo, fmt, fmtInt, fmtPct, semMovimento } from "../assets/nucleo/ui.js";
import { ALFABETO, indice } from "../assets/nucleo/alfabeto.js";
import { obterModelo, estado } from "../assets/nucleo/modelo.js";

// avisoModelo() do núcleo lança erro se o modelo já estiver pronto (o leitor voltou ao
// capítulo depois de o modelo carregar); só o chamamos enquanto ele ainda está carregando.
const aviso = (el) => {
  if (estado.fase !== "pronto") avisoModelo(el);
};

export async function montar(raiz) {
  const limpar = [];
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const w = fig.dataset.widget;
    if (w === "pense") limpar.push(pense(fig));
    if (w === "soma") limpar.push(soma(fig));
    if (w === "surpresa") limpar.push(calculadora(fig));
    if (w === "telegrafo") limpar.push(telegrafo(fig));
    if (w === "morse") limpar.push(morse(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// ---------------------------------------------------------------------------
// Lógica pura (testada em testes/c2.test.mjs)
// ---------------------------------------------------------------------------

/** Menor k com 2^k ≥ n: perguntas de sim ou não que bastam para achar um entre n. */
export function perguntasNecessarias(n) {
  let k = 0;
  while (2 ** k < n) k++;
  return k;
}

/** Corte da busca binária em [lo, hi]: pergunta-se "é maior que m?". A metade de baixo fica com o candidato a mais. */
export function corteAoMeio(lo, hi) {
  return lo + Math.ceil((hi - lo + 1) / 2) - 1;
}

/** Aplica a resposta à pergunta "é maior que corte?" e devolve o novo intervalo e quanto a resposta valeu, em bits. */
export function aplicarResposta(lo, hi, corte, sim) {
  const antes = hi - lo + 1;
  const [nlo, nhi] = sim ? [corte + 1, hi] : [lo, corte];
  const depois = nhi - nlo + 1;
  return { lo: nlo, hi: nhi, bits: Math.log2(antes / depois) };
}

/** Sequência de respostas (1 = sim) da busca binária para o número x em 1..n. */
export function respostasBinarias(x, n) {
  let lo = 1, hi = n;
  const out = [];
  while (lo < hi) {
    const m = corteAoMeio(lo, hi);
    const sim = x > m;
    out.push(sim ? 1 : 0);
    ({ lo, hi } = aplicarResposta(lo, hi, m, sim));
  }
  return out;
}

export const UNIDADES = {
  bit: { base: 2, singular: "bit", plural: "bits" },
  nat: { base: Math.E, singular: "nat", plural: "nats" },
  hartley: { base: 10, singular: "hartley", plural: "hartleys" },
};
/** Converte uma quantidade em bits para outra unidade (mudança de base do logaritmo). */
export const converter = (bits, unidade) => bits / Math.log2(UNIDADES[unidade].base);

// Código Morse internacional.
export const MORSE = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---",
  k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-",
  u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
};
/** Duração de uma letra em Morse, em unidades de ponto: ponto 1, traço 3, pausa interna 1. */
export const duracaoMorse = (cod) => [...cod].reduce((a, c) => a + (c === "." ? 1 : 3), 0) + cod.length - 1;

// Código telegráfico ITA2 (Baudot–Murray). Bits na ordem 1..5 da fita.
export const ITA2_LETRAS = {
  a: "11000", b: "10011", c: "01110", d: "10010", e: "10000", f: "10110", g: "01011", h: "00101",
  i: "01100", j: "11010", k: "11110", l: "01001", m: "00111", n: "00110", o: "00011", p: "01101",
  q: "11101", r: "01010", s: "10100", t: "00001", u: "11100", v: "01111", w: "11001", x: "10111",
  y: "10101", z: "10001",
};
// Registro de algarismos: a mesma combinação, lida depois da mudança 11011.
export const ITA2_ALGARISMOS = {
  "1": "q", "2": "w", "3": "e", "4": "r", "5": "t", "6": "y", "7": "u", "8": "i", "9": "o", "0": "p",
  "-": "a", "?": "b", ":": "c", "(": "k", ")": "l", ".": "m", ",": "n", "'": "s", "=": "v", "/": "x", "+": "z",
};
export const ITA2_COMANDOS = {
  "00000": { curto: "nulo", nome: "combinação vazia" },
  "00100": { curto: "␣", nome: "espaço" },
  "01000": { curto: "CR", nome: "retorno do carro" },
  "00010": { curto: "LF", nome: "mudança de linha" },
  "11111": { curto: "LET", nome: "registro de letras" },
  "11011": { curto: "ALG", nome: "registro de algarismos" },
};
export const LETRAS = "11111", ALGARISMOS = "11011", ESPACO_ITA2 = "00100";

/**
 * Texto -> colunas de fita ITA2, com mudanças de registro.
 * Começa no registro de letras (como a fita do topo dos capítulos).
 * Acentos e cedilha caem para a letra simples; caracteres sem código são ignorados.
 * Cada coluna: { cod, rotulo, tipo: "letra" | "espaco" | "algarismo" | "registro", origem }
 * (origem = índice do caractere no texto, ou -1 para mudanças de registro).
 */
export function ita2(texto) {
  const out = [];
  let registro = "letras";
  [...texto].forEach((c0, i) => {
    const c = c0.toLowerCase();
    if (c === " ") {
      out.push({ cod: ESPACO_ITA2, rotulo: "␣", tipo: "espaco", origem: i });
      return;
    }
    const base = c.normalize("NFD")[0];
    if (ITA2_LETRAS[base]) {
      if (registro !== "letras") {
        out.push({ cod: LETRAS, rotulo: "LET", tipo: "registro", origem: -1 });
        registro = "letras";
      }
      out.push({ cod: ITA2_LETRAS[base], rotulo: base, tipo: "letra", origem: i });
    } else if (ITA2_ALGARISMOS[c]) {
      if (registro !== "algarismos") {
        out.push({ cod: ALGARISMOS, rotulo: "ALG", tipo: "registro", origem: -1 });
        registro = "algarismos";
      }
      out.push({ cod: ITA2_LETRAS[ITA2_ALGARISMOS[c]], rotulo: c, tipo: "algarismo", origem: i });
    }
  });
  return out;
}

/**
 * Custo médio de um código (duração, furos…) sob as frequências dadas, comparado
 * com o melhor, o pior e o arranjo ao acaso dos mesmos custos entre as letras.
 * freqs e custos: objetos letra -> número.
 */
export function arranjos(freqs, custos) {
  const letras = Object.keys(custos);
  const tot = letras.reduce((a, l) => a + (freqs[l] ?? 0), 0);
  const f = letras.map((l) => (freqs[l] ?? 0) / tot);
  const real = letras.reduce((a, l, i) => a + f[i] * custos[l], 0);
  const fs = [...f].sort((a, b) => b - a);
  const cs = letras.map((l) => custos[l]).sort((a, b) => a - b);
  const melhor = fs.reduce((a, x, i) => a + x * cs[i], 0);
  const pior = fs.reduce((a, x, i) => a + x * cs[cs.length - 1 - i], 0);
  const acaso = cs.reduce((a, b) => a + b, 0) / cs.length;
  return { real, melhor, pior, acaso };
}

// ---------------------------------------------------------------------------
// Utilidades de formatação deste capítulo
// ---------------------------------------------------------------------------

/** Número curto: até `casas` decimais, sem zeros à direita. */
function fmtCurto(x, casas = 2) {
  if (x >= 1000) return fmtInt(x);
  return fmt(x, casas).replace(/,?0+$/, "");
}
/** "1 em x": inteiro com milhares se x for grande ou inteiro; senão, até 2 decimais. */
function fmtUmEm(x) {
  if (x >= 100 || Math.abs(x - Math.round(x)) < 1e-6 * x) return fmtInt(x);
  return fmtCurto(x, 2);
}
/** Número pequeno com algarismos significativos suficientes (0,000000029). */
function fmtPequeno(x, sig = 2) {
  if (x === 0) return "0";
  if (x >= 0.01) return fmt(x, 2);
  const casas = Math.min(14, Math.ceil(-Math.log10(x)) + sig - 1);
  return fmt(x, casas);
}
// Em português, o singular vai até antes do 2: "1,44 bit", "2,58 bits".
const plural = (x, u) => (Math.abs(x) < 2 ? UNIDADES[u].singular : UNIDADES[u].plural);

// ---------------------------------------------------------------------------
// 1. Pense num número: busca binária nos dois sentidos
// ---------------------------------------------------------------------------
function pense(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Pense num número",
    legenda:
      "No modo “O livro adivinha”, pense num número e responda; o livro corta os candidatos ao meio a cada pergunta. No modo “Você adivinha”, o livro esconde um número e você escolhe onde cortar. Cada resposta vale log₂(candidatos antes ÷ candidatos depois) bits; as respostas que valem mais de um bit aparecem em amarelo.",
  });
  const TAMANHOS = [2, 8, 100, 1000, 1000000];
  let modo = "livro", N = 100;
  let lo, hi, corte, hist, segredo, acabou;

  const selModo = seletor(
    [
      { valor: "livro", rotulo: "O livro adivinha" },
      { valor: "voce", rotulo: "Você adivinha" },
    ],
    modo,
    (v) => {
      modo = v;
      reiniciar();
    },
    { id: "c2-modo", rotuloAria: "Quem adivinha" }
  );
  selModo.el.querySelectorAll("button").forEach((b, i) => (b.id = ["c2-modo-livro", "c2-modo-voce"][i]));
  const selN = seletor(
    TAMANHOS.map((n) => ({ valor: n, rotulo: fmtInt(n) })),
    N,
    (v) => {
      N = v;
      reiniciar();
    },
    { id: "c2-n", rotuloAria: "Tamanho da lista" }
  );
  selN.el.querySelectorAll("button").forEach((b, i) => (b.id = "c2-n-" + TAMANHOS[i]));

  const pergunta = h("p.adv-pergunta", { "aria-live": "polite" });
  // controles do modo "o livro adivinha"
  const btSim = botao("Sim", () => responder(true), { variante: "primario", id: "c2-sim" });
  const btNao = botao("Não", () => responder(false), { variante: "primario", id: "c2-nao" });
  const ctlLivro = h("div.linha.adv-ctl", btSim, btNao);
  // controles do modo "você adivinha"
  const faixa = h("input#c2-corte-faixa", { type: "range", min: 1, max: 99, step: 1, value: 50, "aria-label": "Ponto de corte" });
  const numero = h("input#c2-corte.adv-numero", { type: "number", min: 1, max: 99, step: 1, value: 50, inputmode: "numeric", "aria-label": "É maior que…" });
  const btPerguntar = botao("Perguntar", () => perguntar(), { variante: "primario", id: "c2-perguntar" });
  const btMeio = botao("Cortar ao meio", () => definirCorte(corteAoMeio(lo, hi)), { variante: "secundario", id: "c2-meio" });
  const ctlVoce = h(
    "div.adv-ctl-voce",
    h("label.adv-rotulo", { for: "c2-corte" }, "O número é maior que"),
    h("div.linha", numero, h("span.adv-interrog", "?"), btPerguntar, btMeio),
    faixa
  );
  const btNovo = botao("Recomeçar", () => reiniciar(), { variante: "discreto", id: "c2-recomecar" });

  const grade = h("div.adv-grade", { "aria-hidden": "true" });
  const lupa = h("div.adv-lupa");
  const respostas = h("p.adv-respostas");
  const placa = leituras([
    { chave: "perg", rotulo: "perguntas", valor: "0" },
    { chave: "rest", rotulo: "candidatos restantes", valor: "—" },
    { chave: "duvida", rotulo: "dúvida restante", valor: "—", destaque: true },
    { chave: "soma", rotulo: "bits obtidos", valor: "0" },
  ]);
  const historico = h("ol.adv-historico");
  const final = h("p.adv-final", { role: "status" });

  corpo.append(
    h("div.linha.adv-topo", h("div", h("span.rotulo-campo", "Quem adivinha"), selModo.el), h("div", h("span.rotulo-campo", "Números de 1 a…"), selN.el)),
    pergunta,
    ctlLivro,
    ctlVoce,
    grade,
    lupa,
    placa.el,
    respostas,
    final,
    historico,
    h("div.linha", btNovo)
  );

  let celulas = [];
  function montarGrade() {
    celulas = [];
    if (N > 1000) {
      grade.hidden = true;
      trocar(grade);
      return;
    }
    grade.hidden = false;
    const cols = N <= 8 ? N : N <= 100 ? 10 : 40;
    grade.style.setProperty("--cols", cols);
    grade.classList.toggle("adv-grade-mil", N > 100);
    const frag = [];
    for (let i = 1; i <= N; i++) {
      const c = h("span.adv-cel", N <= 100 ? String(i) : "");
      celulas.push(c);
      frag.push(c);
    }
    trocar(grade, frag);
  }

  function definirCorte(v) {
    corte = Math.max(lo, Math.min(hi - 1, Math.round(v)));
    faixa.value = corte;
    numero.value = corte;
    desenhar();
  }

  function reiniciar() {
    lo = 1;
    hi = N;
    hist = [];
    acabou = false;
    segredo = 1 + Math.floor(Math.random() * N);
    corte = corteAoMeio(lo, hi);
    montarGrade();
    desenhar();
  }

  function responder(sim) {
    if (acabou) return;
    const r = aplicarResposta(lo, hi, corte, sim);
    hist.push({ corte, sim, bits: r.bits, restam: r.hi - r.lo + 1 });
    lo = r.lo;
    hi = r.hi;
    if (lo === hi) acabou = true;
    else if (modo === "livro" || corte < lo || corte >= hi) corte = corteAoMeio(lo, hi);
    desenhar();
  }

  function perguntar() {
    if (acabou) return;
    const v = Math.round(+numero.value);
    if (!Number.isFinite(v)) return;
    definirCorte(v);
    responder(segredo > corte);
  }

  function desenhar() {
    const restam = hi - lo + 1;
    const somaBits = hist.reduce((a, x) => a + x.bits, 0);
    ctlLivro.hidden = modo !== "livro" || acabou;
    ctlVoce.hidden = modo !== "voce" || acabou;
    // controles do corte
    faixa.min = numero.min = lo;
    faixa.max = numero.max = Math.max(lo, hi - 1);
    faixa.value = numero.value = corte;
    faixa.disabled = hi - 1 <= lo;
    // pergunta
    if (acabou) {
      pergunta.textContent = modo === "livro" ? `Seu número é ${fmtInt(lo)}.` : `Achou: o número escondido era ${fmtInt(lo)}.`;
    } else if (modo === "livro") {
      pergunta.textContent = hist.length
        ? `Ele é maior que ${fmtInt(corte)}?`
        : `Pense num número de 1 a ${fmtInt(N)}. Ele é maior que ${fmtInt(corte)}?`;
    } else {
      pergunta.textContent = hist.length
        ? `O número está entre ${fmtInt(lo)} e ${fmtInt(hi)}. Onde cortar agora?`
        : `Escondi um número de 1 a ${fmtInt(N)}. Faça perguntas do tipo “é maior que…?”.`;
    }
    // grade
    if (celulas.length) {
      for (let i = 0; i < celulas.length; i++) {
        const n = i + 1;
        const c = celulas[i];
        c.classList.toggle("fora", n < lo || n > hi);
        c.classList.toggle("lado-sim", !acabou && n > corte && n <= hi);
        c.classList.toggle("achado", acabou && n === lo);
      }
    }
    desenharLupa();
    // leituras
    placa.definir("perg", String(hist.length));
    placa.definir("rest", fmtInt(restam));
    placa.definir("duvida", fmtBitsTxt(Math.log2(restam)));
    placa.definir("soma", fmtBitsTxt(somaBits));
    respostas.hidden = modo !== "livro" || !hist.length;
    trocar(respostas, h("span.rotulo-campo", "Respostas (sim = 1, não = 0)"), h("span.bits", hist.map((x) => (x.sim ? "1" : "0")).join(" ")));
    // histórico
    trocar(
      historico,
      hist.map((x, i) =>
        h(
          "li",
          h("span.adv-h-perg", `maior que ${fmtInt(x.corte)}?`),
          h("strong", x.sim ? "sim" : "não"),
          h("span.adv-h-bits" + (x.bits > 1.0001 ? ".muito" : ""), fmtBitsTxt(x.bits)),
          h("span.adv-h-rest", `restam ${fmtInt(x.restam)}`)
        )
      )
    );
    historico.hidden = !hist.length;
    // mensagem final
    final.hidden = !acabou;
    if (acabou) {
      const otimo = perguntasNecessarias(N);
      const q = hist.length;
      if (modo === "livro") {
        final.textContent =
          `Foram ${q} pergunta${q === 1 ? "" : "s"}. A busca binária garante achar qualquer número de 1 a ${fmtInt(N)} com no máximo ⌈log₂ ${fmtInt(N)}⌉ = ${otimo}. ` +
          `Somadas, as respostas valeram ${fmtBitsTxt(somaBits)}, que é log₂ ${fmtInt(N)}. Se alguma resposta saiu errada, recomece.`;
      } else {
        const comp =
          q < otimo
            ? "Teve sorte: algumas respostas improváveis valeram mais de um bit."
            : q === otimo
              ? "Empatou com a busca binária."
              : `A busca binária teria garantido no máximo ${otimo}.`;
        final.textContent = `Você usou ${q} pergunta${q === 1 ? "" : "s"}. ${comp} A soma dos bits de todas as respostas é ${fmtBitsTxt(somaBits)}, exatamente log₂ ${fmtInt(N)}, qualquer que seja a estratégia.`;
      }
    }
  }

  function desenharLupa() {
    if (N <= 100) {
      lupa.hidden = true;
      return;
    }
    lupa.hidden = false;
    // régua inteira com o trecho que sobrou
    const pctLo = ((lo - 1) / N) * 100, pctHi = (hi / N) * 100;
    const total = h(
      "div.adv-faixa-total",
      h("span.adv-faixa-resto", { style: { left: pctLo + "%", width: `max(3px, ${pctHi - pctLo}%)` } })
    );
    // lupa: só o intervalo que sobrou, com o corte
    let zoom;
    if (acabou) {
      zoom = h("div.adv-zoom", h("span.adv-zoom-lado.achado", { style: { flexGrow: 1 } }, fmtInt(lo)));
    } else {
      const nNao = corte - lo + 1, nSim = hi - corte;
      zoom = h(
        "div.adv-zoom",
        h("span.adv-zoom-lado.nao", { style: { flexGrow: nNao } }, h("span", "não"), h("span.adv-zoom-num", nNao > 1 ? `${fmtInt(lo)}–${fmtInt(corte)}` : fmtInt(lo))),
        h("span.adv-zoom-lado.sim", { style: { flexGrow: nSim } }, h("span", "sim"), h("span.adv-zoom-num", nSim > 1 ? `${fmtInt(corte + 1)}–${fmtInt(hi)}` : fmtInt(hi)))
      );
    }
    trocar(
      lupa,
      h("div.adv-lupa-linha", h("span.rotulo-campo", `toda a lista, 1 a ${fmtInt(N)}`), total),
      h("div.adv-lupa-linha", h("span.rotulo-campo", "de perto: os candidatos que restam"), zoom)
    );
  }

  faixa.addEventListener("input", () => definirCorte(+faixa.value));
  numero.addEventListener("change", () => definirCorte(+numero.value));
  numero.addEventListener("keydown", (e) => {
    if (e.key === "Enter") perguntar();
  });

  reiniciar();
  return () => {};
}

function fmtBitsTxt(b, casas = 2) {
  if (Math.abs(b - Math.round(b)) < 1e-9) {
    const r = Math.round(b);
    return `${r} ${r < 2 ? "bit" : "bits"}`;
  }
  return `${fmt(b, casas)} ${b < 2 ? "bit" : "bits"}`;
}

// ---------------------------------------------------------------------------
// 2. Possibilidades se multiplicam, bits se somam
// ---------------------------------------------------------------------------
const EVENTOS = [
  { valor: "moeda", rotulo: "moeda", nomes: ["cara", "coroa"] },
  { valor: "naipe", rotulo: "naipe", nomes: ["♠", "♥", "♦", "♣"], longos: ["espadas", "copas", "ouros", "paus"] },
  { valor: "dado", rotulo: "dado", nomes: ["1", "2", "3", "4", "5", "6"] },
  { valor: "semana", rotulo: "semana", nomes: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], longos: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] },
  { valor: "mes", rotulo: "mês", nomes: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], longos: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] },
];

function soma(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Possibilidades se multiplicam, bits se somam",
    legenda: "Cada casa da grade é um resultado do par: a linha diz o primeiro acontecimento, a coluna o segundo. Toque numa casa ou sorteie uma. Descobrir a casa é descobrir a linha e depois a coluna, e por isso os bits se somam.",
  });
  let A = EVENTOS[0], B = EVENTOS[2], sel = null;
  const selA = seletor(EVENTOS.map((e) => ({ valor: e.valor, rotulo: e.rotulo })), A.valor, (v) => {
    A = EVENTOS.find((e) => e.valor === v);
    sel = null;
    desenhar();
  }, { id: "c2-soma-a", rotuloAria: "Primeiro acontecimento (linhas)" });
  const selB = seletor(EVENTOS.map((e) => ({ valor: e.valor, rotulo: e.rotulo })), B.valor, (v) => {
    B = EVENTOS.find((e) => e.valor === v);
    sel = null;
    desenhar();
  }, { id: "c2-soma-b", rotuloAria: "Segundo acontecimento (colunas)" });
  selA.el.querySelectorAll("button").forEach((b, i) => (b.id = "c2-soma-a-" + EVENTOS[i].valor));
  selB.el.querySelectorAll("button").forEach((b, i) => (b.id = "c2-soma-b-" + EVENTOS[i].valor));

  const grade = h("div.soma-grade");
  const contas = h("div.soma-contas");
  const escolha = h("p.soma-escolha", { role: "status" });
  const btSortear = botao("Sortear uma casa", () => {
    sel = [Math.floor(Math.random() * A.nomes.length), Math.floor(Math.random() * B.nomes.length)];
    desenhar();
  }, { id: "c2-sortear" });

  corpo.append(
    h("div.colunas.soma-escolhas", h("div", h("span.rotulo-campo", "Linhas"), selA.el), h("div", h("span.rotulo-campo", "Colunas"), selB.el)),
    h("div.soma-lado", h("div.rolagem.soma-rolagem", grade), contas),
    h("div.linha", btSortear),
    escolha
  );

  const nome = (E, i) => (E.longos ?? E.nomes)[i];
  function desenhar() {
    const a = A.nomes.length, b = B.nomes.length;
    grade.style.setProperty("--cols", b);
    const filhos = [h("span.soma-canto")];
    B.nomes.forEach((n, j) => filhos.push(h("span.soma-cab" + (sel && sel[1] === j ? ".ativo" : ""), n)));
    A.nomes.forEach((n, i) => {
      filhos.push(h("span.soma-cab.soma-cab-linha" + (sel && sel[0] === i ? ".ativo" : ""), n));
      B.nomes.forEach((m, j) => {
        const cls = sel ? (sel[0] === i && sel[1] === j ? ".escolhida" : sel[0] === i || sel[1] === j ? ".cruz" : "") : "";
        filhos.push(
          h("button.soma-cel" + cls, {
            type: "button",
            id: `c2-soma-${i}-${j}`,
            "aria-label": `${nome(A, i)} e ${nome(B, j)}`,
            on: { click: () => { sel = [i, j]; desenhar(); } },
          })
        );
      });
    });
    trocar(grade, filhos);
    const ba = Math.log2(a), bb = Math.log2(b), bab = Math.log2(a * b);
    trocar(
      contas,
      h("p.soma-linha", h("span.soma-num", `${a} × ${b} = ${a * b}`), h("span.soma-txt", "resultados igualmente prováveis")),
      h("p.soma-linha", h("span.soma-num", `log₂ ${a} + log₂ ${b} = log₂ ${a * b}`), h("span.soma-txt", "o logaritmo troca o produto pela soma")),
      h("p.soma-linha.soma-total", h("span.soma-num", `${fmtCurto(ba)} + ${fmtCurto(bb)} = ${fmtCurto(bab)}`), h("span.soma-txt", "bits"))
    );
    escolha.textContent = sel
      ? `Saiu ${nome(A, sel[0])} e ${nome(B, sel[1])}. Saber a linha vale ${fmtBitsTxt(ba)}; saber depois a coluna vale mais ${fmtBitsTxt(bb)}; juntos, ${fmtBitsTxt(bab)}.`
      : "Toque numa casa da grade ou sorteie uma.";
  }
  sel = [1, 3];
  desenhar();
  return () => {};
}

// ---------------------------------------------------------------------------
// 3. Calculadora de surpresa
// ---------------------------------------------------------------------------
const EXEMPLOS = [
  { id: "moeda", rotulo: "dar cara", curto: "moeda", p: 1 / 2, nota: "Uma moeda honesta: duas possibilidades igualmente prováveis." },
  { id: "dado", rotulo: "um dado dar 6", curto: "dado", p: 1 / 6, nota: "Seis faces igualmente prováveis." },
  { id: "carta", rotulo: "tirar o ás de espadas", curto: "carta", p: 1 / 52, nota: "Uma carta específica entre 52." },
  { id: "caras", rotulo: "dez caras seguidas", curto: "10 caras", p: 1 / 1024, nota: "2 × 2 × … × 2, dez vezes: 1.024 sequências igualmente prováveis, uma delas só de caras." },
  { id: "mega", rotulo: "acertar a Mega-Sena", curto: "Mega-Sena", p: 1 / 50063860, nota: "Seis dezenas entre 60: 50.063.860 apostas simples possíveis." },
  { id: "espaco", rotulo: "um espaço", curto: "espaço", letra: " " },
  { id: "e", rotulo: "a letra e", curto: "e", letra: "e" },
  { id: "x", rotulo: "a letra x", curto: "x", letra: "x" },
  { id: "k", rotulo: "a letra k", curto: "k", letra: "k" },
];
const MAX_BITS = 30;

function calculadora(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Calculadora de surpresa",
    legenda: "A régua é logarítmica: cada passo de um bit para a direita corresponde a uma probabilidade duas vezes menor. As letras contam posições nos nove romances de treino, espaços incluídos, sem olhar o contexto.",
  });
  let p = 1 / 50063860, unidade = "bit", ativo = "mega", contagens = null, total = 0;

  const faixa = h("input#c2-prob", { type: "range", min: 0, max: 9, step: 0.001, value: 0, "aria-label": "Probabilidade (escala logarítmica)" });
  const umEm = h("input#c2-um-em.sur-numero", { type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: false, "aria-label": "Chance: 1 em…" });
  const selUn = seletor(
    [
      { valor: "bit", rotulo: "bits" },
      { valor: "nat", rotulo: "nats" },
      { valor: "hartley", rotulo: "hartleys" },
    ],
    unidade,
    (v) => {
      unidade = v;
      desenhar();
    },
    { id: "c2-unidade", rotuloAria: "Unidade" }
  );
  selUn.el.querySelectorAll("button").forEach((b, i) => (b.id = "c2-unidade-" + ["bit", "nat", "hartley"][i]));

  const chips = h("div.sur-chips");
  const botoes = {};
  for (const ex of EXEMPLOS) {
    const b = h("button.sur-chip", { type: "button", id: "c2-ex-" + ex.id, on: { click: () => escolher(ex) } }, ex.rotulo);
    if (ex.letra !== undefined) b.disabled = true;
    botoes[ex.id] = b;
    chips.append(b);
  }
  const grande = h("div.sur-grande", { "aria-live": "polite" });
  const nota = h("p.sur-nota");
  const placa = leituras([
    { chave: "prob", rotulo: "probabilidade", valor: "—" },
    { chave: "nao", rotulo: "se não acontecer", valor: "—" },
    { chave: "caras", rotulo: "o mesmo que acertar", valor: "—" },
  ]);
  const regua = h("div.sur-regua");

  corpo.append(
    h("div", h("span.rotulo-campo", "Exemplos"), chips),
    h(
      "div.sur-entrada",
      h("label.adv-rotulo", { for: "c2-um-em" }, "Chance de 1 em"),
      umEm,
      h("div.sur-faixa", faixa, h("div.sur-faixa-pontas", h("span", "certo"), h("span", "1 em 1 bilhão")))
    ),
    h("div.sur-saida", grande, h("div", h("span.rotulo-campo", "Unidade"), selUn.el)),
    regua,
    placa.el,
    nota
  );
  aviso(corpo);

  function probLetra(c) {
    if (!contagens) return null;
    return contagens[indice(c)] / total;
  }

  function escolher(ex) {
    ativo = ex.id;
    p = ex.letra !== undefined ? probLetra(ex.letra) : ex.p;
    if (p == null) return;
    desenhar(true);
  }

  function definirP(v, origem) {
    if (!(v > 0)) return;
    p = Math.min(1, v);
    ativo = null;
    desenhar(origem !== "faixa", origem !== "numero");
  }

  function desenhar(moverFaixa = true, moverNumero = true) {
    const bits = -Math.log2(p);
    const bitsNao = p < 1 ? -Math.log2(1 - p) : Infinity;
    if (moverFaixa) faixa.value = Math.min(9, Math.log10(1 / p));
    if (moverNumero) umEm.value = fmtUmEm(1 / p);
    for (const [id, b] of Object.entries(botoes)) b.setAttribute("aria-pressed", String(id === ativo));
    const v = converter(bits, unidade);
    trocar(
      grande,
      h("span.sur-valor", bits === 0 ? "0" : fmt(v, 2)),
      h("span.sur-unidade", " " + plural(v, unidade) + " de surpresa")
    );
    placa.definir("prob", p >= 0.0001 ? fmtPct(p, p >= 0.01 ? 1 : 3) : "1 em " + fmtInt(1 / p));
    const vn = converter(bitsNao, unidade);
    placa.definir("nao", p === 1 ? "—" : `${fmtPequeno(vn)} ${plural(vn, unidade)}`);
    placa.definir("caras", bits < 0.05 ? "nenhuma cara" : `${fmtCurto(bits, 1)} cara${Math.abs(bits - 1) < 0.05 ? "" : "s"} seguida${Math.abs(bits - 1) < 0.05 ? "" : "s"}`);
    const ex = EXEMPLOS.find((e) => e.id === ativo);
    if (ex?.letra !== undefined && contagens) {
      const c = contagens[indice(ex.letra)];
      nota.textContent = `Nos nove romances, ${ex.letra === " " ? "o espaço" : `a letra ${ex.letra}`} aparece ${fmtInt(c)} vezes em ${fmtInt(total)} posições: uma vez a cada ${fmtCurto(total / c, 1)}.`;
    } else nota.textContent = ex?.nota ?? `Uma chance em ${fmtCurto(1 / p, 2)} é como sortear uma entre ${fmtCurto(1 / p, 2)} possibilidades igualmente prováveis: log₂ ${fmtCurto(1 / p, 2)} = ${fmt(bits, 2)} bits.`;
    desenharRegua(bits);
  }
  // régua logarítmica desenhada na largura real do contêiner (texto sempre legível)
  let largura = 600;
  function desenharRegua(bits) {
    const L = Math.max(280, largura), estreito = L < 520;
    const m = { l: 14, r: 16 };
    const x = (b) => m.l + (Math.min(b, MAX_BITS) / MAX_BITS) * (L - m.l - m.r);
    const yLinha = 64, alt = 150;
    const svg = s("svg", { class: "sur-svg", viewBox: `0 0 ${L} ${alt}`, width: L, height: alt, role: "img", "aria-label": `Régua de surpresa: ${fmt(bits, 2)} bits` });
    // probabilidades em cima (décadas)
    const nomes = ["1", "1 em 10", "1 em 100", "1 em mil", "1 em 10 mil", "1 em 100 mil", "1 em 1 milhão", "1 em 10 milhões", "1 em 100 milhões", "1 em 1 bilhão"];
    nomes.forEach((n, k) => {
      const xb = x(k * Math.log2(10));
      svg.append(s("line", { x1: xb, x2: xb, y1: yLinha - 8, y2: yLinha, class: "sur-tick" }));
      if (estreito && k % 3 !== 0) return;
      const fila = estreito ? (k / 3) % 2 : k % 2;
      svg.append(s("text", { x: xb, y: 14 + fila * 14, class: "sur-txt-p", "text-anchor": k === 0 ? "start" : k === 9 ? "end" : "middle" }, n));
      svg.append(s("line", { x1: xb, x2: xb, y1: 18 + fila * 14, y2: yLinha - 8, class: "sur-guia" }));
    });
    // trilho e barra de surpresa
    svg.append(s("rect", { x: x(0), y: yLinha, width: x(MAX_BITS) - x(0), height: 12, class: "sur-trilho", rx: 2 }));
    svg.append(s("rect", { x: x(0), y: yLinha, width: Math.max(0, x(bits) - x(0)), height: 12, class: "sur-barra", rx: 2 }));
    svg.append(s("line", { x1: x(bits), x2: x(bits), y1: yLinha - 4, y2: yLinha + 16, class: "sur-cursor" }));
    if (bits > MAX_BITS) svg.append(s("text", { x: x(MAX_BITS) - 2, y: yLinha + 10, class: "sur-txt-b", "text-anchor": "end" }, "→"));
    // bits embaixo
    for (let b = 0; b <= MAX_BITS; b += estreito ? 10 : 5) {
      svg.append(s("text", { x: x(b), y: yLinha + 30, class: "sur-txt-b", "text-anchor": b === 0 ? "start" : b === MAX_BITS ? "end" : "middle" }, b === MAX_BITS ? `${b} bits` : String(b)));
    }
    // exemplos (em fileiras para não se sobreporem)
    const fileiras = [];
    const pontos = EXEMPLOS.map((ex) => ({ ex, b: ex.letra !== undefined ? (contagens ? -Math.log2(probLetra(ex.letra)) : null) : -Math.log2(ex.p) }))
      .filter((q) => q.b != null)
      .sort((a, b) => a.b - b.b);
    for (const q of pontos) {
      const xb = x(q.b), larg = q.ex.curto.length * 7 + 8;
      let f = 0;
      while ((fileiras[f] ?? -Infinity) > xb - larg / 2) f++;
      fileiras[f] = xb + larg / 2;
      const y = yLinha + 48 + f * 15;
      const ativoAqui = q.ex.id === ativo;
      svg.append(
        s("line", { x1: xb, x2: xb, y1: yLinha + 13, y2: y - 10, class: "sur-guia" }),
        s("circle", { cx: xb, cy: yLinha + 6, r: 2.5, class: "sur-ponto" }),
        s("text", { x: xb, y, class: "sur-txt-ex" + (ativoAqui ? " ativo" : ""), "text-anchor": "middle", on: { click: () => escolher(q.ex) } }, q.ex.curto)
      );
    }
    const altura = yLinha + 48 + Math.max(0, fileiras.length - 1) * 15 + 8;
    svg.setAttribute("viewBox", `0 0 ${L} ${altura}`);
    svg.setAttribute("height", altura);
    trocar(regua, svg);
  }

  faixa.addEventListener("input", () => definirP(10 ** -+faixa.value, "faixa"));
  umEm.addEventListener("input", () => {
    // formato brasileiro: ponto separa milhares, vírgula separa decimais
    const v = +umEm.value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    if (v >= 1) definirP(1 / v, "numero");
  });
  umEm.addEventListener("change", () => (umEm.value = fmtUmEm(1 / p)));

  const obs = new ResizeObserver((ents) => {
    const w = Math.floor(ents[0].contentRect.width);
    if (w && Math.abs(w - largura) > 2) {
      largura = w;
      desenharRegua(-Math.log2(p));
    }
  });
  obs.observe(regua);
  largura = regua.clientWidth || 600;

  let vivo = true;
  obterModelo()
    .then((m) => {
      if (!vivo) return;
      contagens = m.contagens([], 0);
      total = contagens.reduce((a, b) => a + b, 0);
      for (const ex of EXEMPLOS) if (ex.letra !== undefined) botoes[ex.id].disabled = false;
      desenhar();
    })
    .catch(() => {});
  desenhar();
  return () => {
    vivo = false;
    obs.disconnect();
  };
}

// ---------------------------------------------------------------------------
// 4. Telégrafo: a fita ITA2 perfurada coluna a coluna
// ---------------------------------------------------------------------------
const TITULO = "Perguntas de sim ou não";

function telegrafo(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Fita perfurada · código ITA2",
    legenda: "Cada coluna da fita é um caractere em 5 bits: furo = 1, papel inteiro = 0, lidos de cima para baixo (os furinhos do meio só puxam a fita). As setas azuis ↑ e ↓ são as mudanças para o registro de algarismos e de volta às letras. Acentos e cedilha caem para a letra simples; caracteres sem código são ignorados. A tabela mostra as 32 combinações possíveis; toque numa letra para escrevê-la.",
  });
  const entrada = h("input#c2-tel-texto", { type: "text", maxlength: 60, autocomplete: "off", spellcheck: false, autocapitalize: "none", "aria-label": "Texto para perfurar" });
  entrada.value = TITULO;
  const fitaBox = h("div.rolagem.tel-rolagem");
  const bits = h("p.bits.tel-bits");
  const placa = leituras([
    { chave: "car", rotulo: "caracteres", valor: "—" },
    { chave: "col", rotulo: "colunas na fita", valor: "—" },
    { chave: "bits", rotulo: "bits perfurados", valor: "—", destaque: true },
  ]);
  const tabela = h("div.tel-tabela");
  const atalhos = h(
    "div.linha",
    botao("O título deste capítulo", () => usar(TITULO), { variante: "secundario", id: "c2-tel-titulo" }),
    botao("Machado, 1908", () => usar("Memorial de Aires, 1908"), { variante: "secundario", id: "c2-tel-ano" }),
    botao("Limpar", () => usar(""), { variante: "discreto", id: "c2-tel-limpar" })
  );

  corpo.append(
    h("div", h("label.rotulo-campo", { for: "c2-tel-texto" }, "Texto"), entrada),
    atalhos,
    fitaBox,
    bits,
    placa.el,
    h("div", h("span.rotulo-campo", "As 32 combinações de 5 bits"), tabela)
  );

  // tabela das 32 combinações, em ordem binária
  const cels = new Map();
  const letraDe = Object.fromEntries(Object.entries(ITA2_LETRAS).map(([l, c]) => [c, l]));
  const algDe = Object.fromEntries(Object.entries(ITA2_ALGARISMOS).map(([a, l]) => [ITA2_LETRAS[l], a]));
  for (let v = 0; v < 32; v++) {
    const cod = v.toString(2).padStart(5, "0");
    const l = letraDe[cod], cmd = ITA2_COMANDOS[cod], alg = algDe[cod];
    const furos = h("span.tel-mini", { "aria-hidden": "true" }, [...cod].map((b, k) => [k === 3 ? h("i.tel-mini-tracao") : null, h("i" + (b === "1" ? ".on" : ""))]));
    const corpoCel = [furos, h("span.tel-cel-letra", l ?? cmd.curto), h("span.tel-cel-cod", cod), alg ? h("span.tel-cel-alg", alg) : h("span.tel-cel-alg", " ")];
    const titulo = l ? `${l} · ${cod}${alg ? ` · no registro de algarismos: ${alg}` : ""}` : `${cmd.nome} · ${cod}`;
    const cel = l || cod === ESPACO_ITA2
      ? h("button.tel-cel" + (cmd ? ".tel-cmd" : ""), { type: "button", id: "c2-tel-" + cod, title: titulo, "aria-label": titulo, on: { click: () => usar((entrada.value + (l ?? " ")).slice(0, 60)) } }, corpoCel)
      : h("span.tel-cel.tel-cmd", { title: titulo }, corpoCel);
    cels.set(cod, cel);
    tabela.append(cel);
  }

  let anteriores = [], digitou = false;
  function usar(t) {
    digitou = true;
    entrada.value = t;
    perfurar();
  }

  function perfurar() {
    const cols = ita2(entrada.value);
    // quantas colunas iniciais não mudaram (essas não se animam de novo)
    let comum = 0;
    while (comum < cols.length && comum < anteriores.length && cols[comum].cod === anteriores[comum].cod && cols[comum].rotulo === anteriores[comum].rotulo) comum++;
    const animar = !semMovimento();
    const P = 22, alt = 6 * 16 + 30;
    const larg = Math.max(cols.length, 1) * P + P;
    const svg = s("svg", { class: "tel-fita", viewBox: `0 0 ${larg} ${alt}`, width: larg, height: alt, role: "img", "aria-label": `Fita ITA2 com ${cols.length} colunas` });
    svg.append(s("rect", { x: 0, y: 2, width: larg, height: 6 * 16 + 4, class: "tel-papel", rx: 2 }));
    cols.forEach((col, i) => {
      const cx = P / 2 + i * P + P / 2;
      const g = s("g", { class: "tel-col" + (col.tipo === "registro" ? " registro" : "") + (animar && i >= comum ? " nova" : ""), style: `--d:${(i - comum) * 70}ms` });
      g.append(s("title", {}, `${col.tipo === "registro" ? ITA2_COMANDOS[col.cod].nome : col.rotulo} · ${col.cod}`));
      const linhas = [col.cod[0], col.cod[1], col.cod[2], "t", col.cod[3], col.cod[4]];
      linhas.forEach((b, k) => {
        const cy = 12 + k * 16;
        if (b === "t") g.append(s("circle", { cx, cy, r: 2, class: "tel-tracao" }));
        else g.append(s("circle", { cx, cy, r: 5.2, class: b === "1" ? "tel-furo" : "tel-vazio" }));
      });
      g.append(s("text", { x: cx, y: 6 * 16 + 22, class: "tel-letra", "text-anchor": "middle" }, col.tipo === "registro" ? (col.cod === ALGARISMOS ? "↑" : "↓") : col.rotulo));
      svg.append(g);
    });
    trocar(fitaBox, svg);
    if (cols.length > comum && digitou) fitaBox.scrollLeft = fitaBox.scrollWidth;
    anteriores = cols;

    trocar(
      bits,
      cols.length
        ? cols.map((c, i) => [i ? " " : "", h("span" + (c.tipo === "registro" ? ".tel-bits-reg" : ""), c.cod)])
        : h("span.tel-vazio-txt", "(fita em branco)")
    );
    const nCar = [...entrada.value].filter((c, i) => cols.some((x) => x.origem === i)).length;
    placa.definir("car", String(nCar));
    placa.definir("col", String(cols.length) + (cols.some((c) => c.tipo === "registro") ? ` (${cols.filter((c) => c.tipo === "registro").length} de registro)` : ""));
    placa.definir("bits", `${5 * cols.length}`);
    const usados = new Set(cols.map((c) => c.cod));
    for (const [cod, el] of cels) el.classList.toggle("usado", usados.has(cod));
  }

  entrada.addEventListener("input", () => {
    digitou = true;
    perfurar();
  });
  perfurar();
  return () => {};
}

// ---------------------------------------------------------------------------
// 5. Morse (e a fita de Murray) contra a frequência das letras em Machado
// ---------------------------------------------------------------------------
function morse(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Códigos curtos para letras frequentes",
    legenda: "Letras em ordem de frequência nos nove romances de Machado (acentuadas somadas à letra simples, espaços fora da conta). No Morse, a duração conta pontos (1), traços (3) e as pausas de 1 dentro da letra. Na fita de Murray, o custo é o número de furos. Os números de baixo usam as frequências de Machado.",
  });
  let modo = "morse";
  const sel = seletor(
    [
      { valor: "morse", rotulo: "Morse (duração)" },
      { valor: "ita2", rotulo: "Fita de Murray (furos)" },
    ],
    modo,
    (v) => {
      modo = v;
      desenhar();
    },
    { id: "c2-morse-modo", rotuloAria: "Código" }
  );
  sel.el.querySelectorAll("button").forEach((b, i) => (b.id = ["c2-morse-morse", "c2-morse-ita2"][i]));
  const lista = h("div.morse-lista", { role: "table", "aria-label": "Letras, frequência e código" });
  const placa = leituras([
    { chave: "real", rotulo: "código de verdade", valor: "—", destaque: true },
    { chave: "acaso", rotulo: "códigos ao acaso", valor: "—" },
    { chave: "pior", rotulo: "pior arranjo", valor: "—" },
    { chave: "melhor", rotulo: "melhor arranjo", valor: "—" },
  ]);
  const unidadeTxt = h("p.morse-unidade");
  corpo.append(h("div.linha", sel.el), lista, h("div", unidadeTxt, placa.el));
  aviso(corpo);

  let freqs = null;
  const letras = Object.keys(MORSE);
  function desenhar() {
    if (!freqs) return;
    const tot = letras.reduce((a, l) => a + freqs[l], 0);
    const ordem = [...letras].sort((a, b) => freqs[b] - freqs[a]);
    const fmax = freqs[ordem[0]] / tot;
    const custos = Object.fromEntries(letras.map((l) => [l, modo === "morse" ? duracaoMorse(MORSE[l]) : [...ITA2_LETRAS[l]].filter((b) => b === "1").length]));
    const linhas = ordem.map((l, i) => {
      const f = freqs[l] / tot;
      const glifo =
        modo === "morse"
          ? h("span.morse-glifo", { "aria-label": MORSE[l].replace(/\./g, "ponto ").replace(/-/g, "traço ").trim() }, [...MORSE[l]].map((c) => h(c === "." ? "i.ponto" : "i.traco")))
          : h("span.morse-glifo.furos", { "aria-label": ITA2_LETRAS[l] }, [...ITA2_LETRAS[l]].map((b, k) => [k === 3 ? h("i.tracao") : null, h("i.furo" + (b === "1" ? ".on" : ""))]));
      return h(
        "div.morse-linha",
        { role: "row" },
        h("span.morse-pos", { role: "cell" }, String(i + 1)),
        h("span.morse-letra", { role: "cell" }, l),
        h("span.morse-barra", { role: "cell", "aria-label": fmtPct(f, 1) }, h("i", { style: { width: (100 * f) / fmax + "%" } })),
        h("span.morse-pct", { role: "cell" }, fmtPct(f, f >= 0.001 ? 1 : 3)),
        h("span.morse-cod", { role: "cell" }, glifo),
        h("span.morse-custo", { role: "cell", "data-c": custos[l] }, String(custos[l]))
      );
    });
    trocar(
      lista,
      h(
        "div.morse-linha.morse-cabeca",
        { role: "row" },
        h("span.morse-pos", ""),
        h("span.morse-letra", ""),
        h("span.morse-barra-cab", { role: "columnheader" }, "frequência"),
        h("span.morse-pct", ""),
        h("span.morse-cod", { role: "columnheader" }, modo === "morse" ? "código" : "furos na fita"),
        h("span.morse-custo", { role: "columnheader" }, modo === "morse" ? "duração" : "furos")
      ),
      linhas
    );
    const r = arranjos(freqs, custos);
    unidadeTxt.textContent = modo === "morse" ? "Duração média de uma letra de Machado, em unidades de ponto, com os mesmos 26 códigos distribuídos de quatro maneiras:" : "Furos por letra de Machado, em média, com as mesmas 26 combinações distribuídas de quatro maneiras:";
    placa.definir("real", fmt(r.real, 2));
    placa.definir("acaso", fmt(r.acaso, 2));
    placa.definir("pior", fmt(r.pior, 2));
    placa.definir("melhor", fmt(r.melhor, 2));
  }

  let vivo = true;
  obterModelo()
    .then((m) => {
      if (!vivo) return;
      const c = m.contagens([], 0);
      freqs = Object.fromEntries(letras.map((l) => [l, 0]));
      for (let i = 1; i < ALFABETO.length; i++) {
        const base = ALFABETO[i].normalize("NFD")[0];
        if (base in freqs) freqs[base] += c[i];
      }
      desenhar();
    })
    .catch(() => {});
  return () => {
    vivo = false;
  };
}
