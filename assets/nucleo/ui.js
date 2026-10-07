// Ferramentas de interface compartilhadas pelos capítulos:
// criação de elementos, números em português, controles, gráficos SVG simples,
// o "marca-texto da surpresa" e memória local (com tolerância a falhas).

import { ALFABETO, alinhar, codificar, rotulo } from "./alfabeto.js";
import { aoProgresso } from "./modelo.js";

// ---------- DOM ----------

/**
 * h("div.classe#id", { atributos, on: { click } }, ...filhos)
 * Filhos podem ser strings, nós, arrays, null/false (ignorados).
 */
export function h(tag, attrs, ...filhos) {
  const [, nome = "div", resto = ""] = tag.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(nome || "div");
  for (const parte of resto.match(/[.#][^.#]+/g) ?? []) {
    if (parte[0] === ".") el.classList.add(parte.slice(1));
    else el.id = parte.slice(1);
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    filhos.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "on") for (const [ev, f] of Object.entries(v)) el.addEventListener(ev, f);
    else if (k === "style" && typeof v === "object")
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    else if (k === "class") el.className += " " + v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  anexar(el, filhos);
  return el;
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

/** Esvazia um elemento e preenche com novos filhos. */
export function trocar(el, ...filhos) {
  el.replaceChildren();
  anexar(el, filhos);
  return el;
}

const NS = "http://www.w3.org/2000/svg";
/** Cria elemento SVG: s("rect", { x, y, width, height, class }) */
export function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "on") for (const [ev, f] of Object.entries(v)) el.addEventListener(ev, f);
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

// ---------- Números em português ----------

const formatos = new Map();
/** Número com vírgula decimal: fmt(2.0713, 2) -> "2,07". */
export function fmt(x, casas = 2) {
  if (!Number.isFinite(x)) return x === Infinity ? "∞" : "—";
  let f = formatos.get(casas);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    formatos.set(casas, f);
  }
  return f.format(x);
}
/** Inteiro com separador de milhar: fmtInt(2635226) -> "2.635.226". */
export const fmtInt = (x) => new Intl.NumberFormat("pt-BR").format(Math.round(x));
/** Porcentagem: fmtPct(0.123) -> "12,3%". */
export const fmtPct = (x, casas = 1) => fmt(100 * x, casas) + "%";
/** Bits com unidade e singular/plural: fmtBits(1.5) -> "1,50 bit", fmtBits(2.5) -> "2,50 bits". */
export function fmtBits(x, casas = 2) {
  const n = Number.isInteger(x) ? String(x) : fmt(x, casas);
  return n + (Math.abs(x) < 2 ? " bit" : " bits"); // em português, plural só a partir de 2
}

// ---------- Controles ----------

/**
 * Controle deslizante com rótulo e valor ao vivo.
 * deslizante({ id, rotulo, min, max, passo, valor, formato, aoMudar })
 * Devolve { el, input, valor(), definir(v) }.
 */
export function deslizante({ id, rotulo, min = 0, max = 1, passo = 0.01, valor = 0.5, formato = (v) => fmt(v, 2), aoMudar }) {
  const input = h("input", { type: "range", id, min, max, step: passo, value: valor });
  const saida = h("output.valor", { for: id }, formato(+valor));
  const el = h("label.deslizante", { for: id }, h("span.rotulo", rotulo), input, saida);
  const atualizar = () => {
    saida.textContent = formato(+input.value);
    aoMudar?.(+input.value);
  };
  input.addEventListener("input", atualizar);
  return {
    el,
    input,
    valor: () => +input.value,
    definir(v, avisar = true) {
      input.value = v;
      saida.textContent = formato(+input.value);
      if (avisar) aoMudar?.(+input.value);
    },
  };
}

/** Botão. variante: "primario" | "secundario" (padrão) | "discreto". */
export function botao(texto, aoClicar, { variante = "secundario", id, titulo } = {}) {
  return h("button.botao." + variante, { type: "button", id, title: titulo, on: { click: aoClicar } }, texto);
}

/** Grupo de botões exclusivos (como abas). opcoes: [{ valor, rotulo }]. */
export function seletor(opcoes, valorInicial, aoMudar, { id, rotuloAria } = {}) {
  const el = h("div.seletor", { role: "radiogroup", id, "aria-label": rotuloAria });
  const botoes = opcoes.map((o) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": String(o.valor === valorInicial),
        on: {
          click: () => {
            for (const b of botoes) b.setAttribute("aria-checked", String(b === bt(o)));
            aoMudar(o.valor);
          },
        },
      },
      o.rotulo
    )
  );
  const bt = (o) => botoes[opcoes.indexOf(o)];
  el.append(...botoes);
  return {
    el,
    definir(v) {
      opcoes.forEach((o, i) => botoes[i].setAttribute("aria-checked", String(o.valor === v)));
    },
  };
}

/** Painel de leituras: pares rótulo/valor alinhados. itens: [{ rotulo, valor, destaque? }] */
export function leituras(itens) {
  const el = h("dl.leituras");
  const cels = {};
  for (const it of itens) {
    const dd = h("dd", it.valor ?? "—");
    if (it.destaque) dd.classList.add("destaque");
    el.append(h("div", h("dt", it.rotulo), dd));
    cels[it.chave ?? it.rotulo] = dd;
  }
  return {
    el,
    definir(chave, valor) {
      if (cels[chave]) cels[chave].textContent = valor;
    },
  };
}

/**
 * Moldura padrão de um interativo: título curto, corpo, legenda.
 * Uso: const f = moldura(figEl, { titulo, legenda }); f.corpo.append(...)
 */
export function moldura(fig, { titulo, legenda } = {}) {
  fig.classList.add("interativo");
  const corpo = h("div.interativo-corpo");
  trocar(fig, titulo ? h("div.interativo-titulo", titulo) : null, corpo, legenda ? h("figcaption", legenda) : null);
  return { corpo, fig };
}

/** Mostra o progresso do treino do modelo dentro de um elemento, até ficar pronto. */
export function avisoModelo(el) {
  const msg = h("p.aviso-modelo", { role: "status" });
  el.append(msg);
  let desligar = null, pronto = false;
  desligar = aoProgresso((e) => {
    if (e.fase === "lendo") msg.textContent = "Lendo nove romances de Machado de Assis…";
    else if (e.fase === "contando") msg.textContent = `Contando sequências de letras… ordem ${Math.max(e.ordem + 1, 0)} de 6`;
    else if (e.fase === "erro") msg.textContent = "Não consegui carregar o corpus. Recarregue a página para tentar de novo.";
    else if (e.fase === "pronto") {
      msg.remove();
      pronto = true;
      desligar?.();
    }
  });
  if (pronto) desligar();
  return msg;
}

// ---------- Escalas e gráficos ----------

/** Escala linear: escala([d0,d1],[r0,r1]) -> função, com .inv */
export function escala([d0, d1], [r0, r1]) {
  const f = (x) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
  f.inv = (y) => d0 + ((y - r0) / (r1 - r0)) * (d1 - d0);
  f.dominio = [d0, d1];
  return f;
}

/** Marcas "bonitas" para um intervalo: ticks(0, 5.3, 5) -> [0,1,2,3,4,5] */
export function ticks(a, b, n = 5) {
  const passoBruto = (b - a) / n;
  const mag = 10 ** Math.floor(Math.log10(passoBruto));
  const r = passoBruto / mag;
  const passo = (r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let x = Math.ceil(a / passo) * passo; x <= b + passo * 1e-9; x += passo) out.push(+x.toFixed(10));
  return out;
}

/**
 * Gráfico SVG responsivo com área de plotagem e eixos.
 * grafico({ largura, altura, margem, x: [d0,d1], y: [d0,d1], rotuloX, rotuloY, ticksX, ticksY, fmtX, fmtY })
 * Devolve { svg, plot (grupo da área), x, y (escalas), largura, altura }.
 */
export function grafico({
  largura = 640,
  altura = 300,
  margem = { t: 16, r: 16, b: 44, l: 52 },
  x: dx = [0, 1],
  y: dy = [0, 1],
  rotuloX,
  rotuloY,
  ticksX,
  ticksY,
  fmtX = (v) => fmt(v, Number.isInteger(v) ? 0 : 1),
  fmtY = (v) => fmt(v, Number.isInteger(v) ? 0 : 1),
  grade = true,
} = {}) {
  const svg = s("svg", { viewBox: `0 0 ${largura} ${altura}`, class: "grafico", role: "img" });
  const x = escala(dx, [margem.l, largura - margem.r]);
  const y = escala(dy, [altura - margem.b, margem.t]);
  const eixos = s("g", { class: "eixos" });
  const tx = ticksX ?? ticks(dx[0], dx[1], 6);
  const ty = ticksY ?? ticks(dy[0], dy[1], 5);
  for (const v of ty) {
    if (grade) eixos.append(s("line", { x1: margem.l, x2: largura - margem.r, y1: y(v), y2: y(v), class: "grade" }));
    eixos.append(s("text", { x: margem.l - 8, y: y(v), class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, fmtY(v)));
  }
  for (const v of tx) {
    eixos.append(s("text", { x: x(v), y: altura - margem.b + 18, class: "tick", "text-anchor": "middle" }, fmtX(v)));
  }
  eixos.append(s("line", { x1: margem.l, x2: largura - margem.r, y1: altura - margem.b, y2: altura - margem.b, class: "eixo" }));
  if (rotuloX) eixos.append(s("text", { x: (margem.l + largura - margem.r) / 2, y: altura - 6, class: "rotulo-eixo", "text-anchor": "middle" }, rotuloX));
  if (rotuloY)
    eixos.append(
      s("text", { x: 14, y: (margem.t + altura - margem.b) / 2, class: "rotulo-eixo", "text-anchor": "middle", transform: `rotate(-90 14 ${(margem.t + altura - margem.b) / 2})` }, rotuloY)
    );
  const plot = s("g", { class: "plot" });
  svg.append(eixos, plot);
  return { svg, plot, x, y, largura, altura, margem };
}

/** Caminho SVG de uma polilinha: caminho([[x,y],...]) */
export const caminho = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join("");

// ---------- O marca-texto da surpresa ----------

/** Intensidade (0..1) do marca-texto para uma surpresa em bits. Satura em `teto` bits. */
export const intensidade = (bits, teto = 10) => Math.max(0, Math.min(1, bits / teto));

/**
 * Pinta um texto original (com pontuação e maiúsculas) com o marca-texto da surpresa.
 * `surpresas` é um Float64Array alinhado ao texto normalizado.
 * Cada caractere vira <span class="letra" style="--s: 0..1" data-bits="…">.
 * Devolve o elemento e a lista de spans por posição normalizada.
 */
export function textoMarcado(original, surpresas, { teto = 10, rotular = true } = {}) {
  const { mapa, chars } = alinhar(original);
  const el = h("p.marcado");
  const porPos = [];
  chars.forEach((c, i) => {
    const j = mapa[i];
    if (j < 0 || !surpresas) {
      el.append(c);
      return;
    }
    const b = surpresas[j];
    const sp = h("span.letra", { style: { "--s": intensidade(b, teto).toFixed(3) } }, c);
    if (intensidade(b, teto) > 0.5) sp.classList.add("forte"); // texto escuro sobre amarelo forte
    if (rotular) sp.title = `${rotulo(chars[i] === " " ? " " : c.toLowerCase())}: ${fmt(b, 1)} bits`;
    sp.dataset.bits = b.toFixed(2);
    porPos[j] = sp;
    el.append(sp);
  });
  return { el, porPos };
}

/** Legenda do marca-texto: uma régua de 0 a `teto` bits. */
export function reguaSurpresa(teto = 10) {
  const passos = [0, 2, 4, 6, 8, 10].filter((v) => v <= teto);
  return h(
    "div.regua-surpresa",
    { "aria-hidden": "true" },
    h("span.regua-rotulo", "surpresa"),
    passos.map((v) => h("span.regua-passo", { style: { "--s": intensidade(v, teto) } }, `${v}`)),
    h("span.regua-rotulo", "bits")
  );
}

// ---------- Fita perfurada (código Baudot–Murray, ITA2) ----------

const ITA2 = {
  a: "11000", b: "10011", c: "01110", d: "10010", e: "10000", f: "10110", g: "01011", h: "00101",
  i: "01100", j: "11010", k: "11110", l: "01001", m: "00111", n: "00110", o: "00011", p: "01101",
  q: "11101", r: "01010", s: "10100", t: "00001", u: "11100", v: "01111", w: "11001", x: "10111",
  y: "10101", z: "10001", " ": "00100",
};

/** Bits ITA2 (5 por letra) de um texto; acentos caem para a letra base. */
export function baudot(texto) {
  const out = [];
  for (const c of texto.toLowerCase()) {
    const base = c.normalize("NFD")[0];
    const cod = ITA2[base] ?? ITA2[c];
    if (cod) out.push(cod);
  }
  return out;
}

/** Desenha uma fita perfurada com o texto em ITA2. Linha de tração entre o 3º e o 4º furo. */
export function fita(texto, { titulo } = {}) {
  const cols = baudot(texto);
  const passo = 12, alt = 7 * passo;
  const svg = s("svg", { class: "fita", viewBox: `0 0 ${cols.length * passo + passo} ${alt}`, role: "img", "aria-label": titulo ?? `“${texto}” em código telegráfico de 5 bits` });
  svg.append(s("title", {}, `“${texto}” perfurado em código Baudot–Murray (ITA2): cada coluna é uma letra, cada furo um bit 1.`));
  cols.forEach((cod, i) => {
    const cx = passo / 2 + i * passo + passo / 2;
    const linhas = [cod[0], cod[1], cod[2], "t", cod[3], cod[4]];
    linhas.forEach((b, k) => {
      const cy = passo * 0.75 + k * passo;
      if (b === "t") svg.append(s("circle", { cx, cy, r: 1.6, class: "furo-tracao" }));
      else if (b === "1") svg.append(s("circle", { cx, cy, r: 3.6, class: "furo" }));
    });
  });
  return svg;
}

// ---------- Memória local ----------

const PREFIXO = "medida-surpresa:";
/** Lê um valor guardado neste navegador (ou `padrao`). Nunca lança. */
export function lerLocal(chave, padrao = null) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v == null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
}
/** Guarda um valor neste navegador. Falhas são ignoradas. */
export function guardarLocal(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {}
}

/** Respeita "reduzir movimento". */
export const semMovimento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Copia texto; se o navegador recusar, seleciona o conteúdo de `alvo` para cópia manual. */
export async function copiar(texto, alvo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    if (alvo) {
      const r = document.createRange();
      r.selectNodeContents(alvo);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return false;
  }
}

export { ALFABETO, codificar, rotulo };
