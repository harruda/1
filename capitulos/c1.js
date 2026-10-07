// Capítulo 1 — O jogo de adivinhação
import { h, s, trocar, moldura, botao, leituras, avisoModelo, fmt, fmtPct, grafico, lerLocal, guardarLocal } from "../assets/nucleo/ui.js";
import { ALFABETO, K, codificar, decodificar, indice, normalizarChar, rotulo } from "../assets/nucleo/alfabeto.js";
import { obterModelo, trechos } from "../assets/nucleo/modelo.js";
import { limitesShannon } from "../assets/nucleo/info.js";

const CHAVE = "jogo-shannon"; // { rodadas: [{ frase, voce: [palpites], maquina: [palpites] }] }

export function lerRodadas() {
  return lerLocal(CHAVE, { rodadas: [] }).rodadas ?? [];
}

const eventos = new EventTarget(); // avisa o placar quando uma rodada termina

export async function montar(raiz) {
  const limpar = [];
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const w = fig.dataset.widget;
    if (w === "jogo") limpar.push(jogo(fig));
    if (w === "gemeo") limpar.push(gemeo(fig));
    if (w === "placar") limpar.push(placar(fig));
  }
  return () => limpar.forEach((f) => f?.());
}

// Frases curtas e completas, para uma rodada caber em poucos minutos.
async function frasesJogaveis() {
  const d = await trechos();
  return d.frases.filter((f) => f.normalizado.length >= 70 && f.normalizado.length <= 110);
}

// ---------------------------------------------------------------------------
// O jogo
// ---------------------------------------------------------------------------
function jogo(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O jogo de Shannon · Memorial de Aires",
    legenda: "Digite pelo teclado ou toque nas teclas. Os números sob as letras contam quantos palpites cada uma custou. Ao terminar a frase, a máquina mostra quantos palpites ela teria precisado.",
  });

  let frase = null, alvo = null, pos = 0, tentativas = new Set(), palpites = [], lista = [], k = 0, acabou = false;

  const linhaTexto = h("div.jogo-texto", { "aria-live": "off" });
  const status = h("p.jogo-status", { role: "status" });
  const tentadas = h("p.jogo-tentadas");
  const entrada = h("input.jogo-entrada#c1-entrada", {
    type: "text",
    autocomplete: "off",
    autocapitalize: "none",
    spellcheck: false,
    "aria-label": "Seu palpite para a próxima letra",
    placeholder: "palpite",
    maxlength: 2,
  });
  const teclado = h("div.teclado", { "aria-label": "Teclado do jogo" });
  const placa = leituras([
    { chave: "letras", rotulo: "letras", valor: "0" },
    { chave: "primeira", rotulo: "de primeira", valor: "—" },
    { chave: "media", rotulo: "palpites por letra", valor: "—" },
  ]);
  const resultado = h("div.jogo-resultado");
  resultado.hidden = true;
  const btNova = botao("Outra frase", () => nova(), { variante: "secundario" });
  const btRevelar = botao("Revelar a letra", () => revelar(), { variante: "discreto", titulo: "Conta como 39 palpites, o pior caso" });

  const fileiras = ["abcdefghijklm", "nopqrstuvwxyz", "áàâãéêíóôõúç"];
  for (const f of fileiras) teclado.append(h("div.teclado-fileira", [...f].map((c) => h("button.tecla", { type: "button", "data-c": c, on: { click: () => palpitar(c) } }, c))));
  teclado.append(h("div.teclado-fileira", h("button.tecla.espaco", { type: "button", "data-c": " ", on: { click: () => palpitar(" ") } }, "espaço")));

  corpo.append(
    linhaTexto,
    h("div.linha.jogo-controles", entrada, tentadas, h("span", { style: { marginLeft: "auto" } }, btRevelar, btNova)),
    status,
    teclado,
    placa.el,
    resultado
  );
  avisoModelo(corpo);

  entrada.addEventListener("input", () => {
    const v = entrada.value;
    entrada.value = "";
    if (!v) return;
    const c = normalizarChar(v[v.length - 1]);
    palpitar(c);
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && acabou) nova();
  });

  function desenharTexto() {
    const filhos = [];
    let palavra = h("span.jogo-palavra");
    for (let i = 0; i < frase.length; i++) {
      const c = frase[i];
      const cel = h("span.jogo-cel");
      if (i < pos) {
        cel.append(h("span.jogo-letra", c === " " ? " " : c), h("span.jogo-num", { "data-n": palpites[i] }, palpites[i] >= K ? "×" : String(palpites[i])));
        if (c === " ") cel.classList.add("jogo-espaco");
      } else if (i === pos && !acabou) {
        cel.classList.add("jogo-cursor");
        cel.append(h("span.jogo-letra", " "), h("span.jogo-num", " "));
      } else {
        cel.classList.add("jogo-oculta");
        cel.append(h("span.jogo-letra", " "), h("span.jogo-num", " "));
      }
      if (i >= pos && !acabou) {
        // casas ainda ocultas não se agrupam por palavra: a quebra de linha não pode revelar onde ficam os espaços
        if (palavra.childNodes.length) filhos.push(palavra);
        palavra = h("span.jogo-palavra");
        filhos.push(cel);
        continue;
      }
      palavra.append(cel);
      if (c === " ") {
        filhos.push(palavra);
        palavra = h("span.jogo-palavra");
      }
    }
    if (palavra.childNodes.length) filhos.push(palavra);
    trocar(linhaTexto, filhos);
  }

  function atualizarPlaca() {
    const n = palpites.length;
    placa.definir("letras", `${n} de ${frase.length}`);
    if (n) {
      placa.definir("primeira", fmtPct(palpites.filter((g) => g === 1).length / n, 0));
      placa.definir("media", fmt(palpites.reduce((a, b) => a + b, 0) / n, 2));
    } else {
      placa.definir("primeira", "—");
      placa.definir("media", "—");
    }
  }

  function atualizarTeclado() {
    for (const b of teclado.querySelectorAll(".tecla")) {
      b.disabled = acabou || tentativas.has(b.dataset.c);
    }
    tentadas.textContent = tentativas.size ? "já tentou: " + [...tentativas].map((c) => rotulo(c)).join(" ") : "";
  }

  function palpitar(c) {
    if (acabou || !frase) return;
    if (indice(c) < 0 || tentativas.has(c)) return;
    tentativas.add(c);
    if (c === frase[pos]) {
      palpites.push(tentativas.size);
      avancar(tentativas.size === 1 ? "Na mosca." : `Acertou no ${tentativas.size}º palpite.`);
    } else {
      status.textContent = `Não é “${rotulo(c)}”. Tente outra.`;
      atualizarTeclado();
    }
  }

  function revelar() {
    if (acabou || !frase) return;
    palpites.push(K); // pior caso possível
    avancar(`Era “${rotulo(frase[pos])}”. Contado como ${K} palpites.`);
  }

  function avancar(msg) {
    pos++;
    tentativas = new Set();
    status.textContent = msg;
    if (pos >= frase.length) terminar();
    desenharTexto();
    atualizarTeclado();
    atualizarPlaca();
  }

  async function terminar() {
    acabou = true;
    status.textContent = "Frase completa. Veja como a máquina se saiu na mesma frase.";
    const m = await obterModelo();
    const cod = codificar(frase);
    const maquina = Array.from(cod, (sim, i) => m.posicaoDoPalpite(cod, sim, 5, i));
    const r = lerLocal(CHAVE, { rodadas: [] });
    r.rodadas = [...(r.rodadas ?? []), { frase, voce: palpites, maquina }].slice(-50);
    guardarLocal(CHAVE, r);
    eventos.dispatchEvent(new Event("rodada"));

    const linhaM = h("div.jogo-texto.jogo-maquina");
    let palavra = h("span.jogo-palavra");
    const grupos = [];
    for (let i = 0; i < frase.length; i++) {
      const c = frase[i];
      palavra.append(h("span.jogo-cel" + (c === " " ? ".jogo-espaco" : ""), h("span.jogo-letra", c === " " ? " " : c), h("span.jogo-num", { "data-n": maquina[i] }, String(maquina[i]))));
      if (c === " ") {
        grupos.push(palavra);
        palavra = h("span.jogo-palavra");
      }
    }
    grupos.push(palavra);
    linhaM.append(...grupos);
    const prim = (a) => a.filter((g) => g === 1).length / a.length;
    const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    trocar(
      resultado,
      h("div.interativo-titulo", "A máquina na mesma frase"),
      linhaM,
      h(
        "p.jogo-comparacao",
        `Você acertou ${fmtPct(prim(palpites), 0)} das letras de primeira, com ${fmt(med(palpites), 2)} palpites por letra em média. `,
        `A máquina acertou ${fmtPct(prim(maquina), 0)} de primeira, com ${fmt(med(maquina), 2)} palpites por letra. `,
        prim(palpites) > prim(maquina) ? "Você venceu esta rodada." : prim(palpites) < prim(maquina) ? "A máquina venceu esta rodada." : "Empate."
      )
    );
    resultado.hidden = false;
    btNova.classList.replace("secundario", "primario");
  }

  async function nova() {
    if (!lista.length) lista = (await frasesJogaveis()).sort(() => Math.random() - 0.5);
    const t = lista[k++ % lista.length];
    frase = t.normalizado;
    alvo = t;
    pos = 0;
    palpites = [];
    tentativas = new Set();
    acabou = false;
    resultado.hidden = true;
    btNova.classList.replace("primario", "secundario");
    status.textContent = "Qual é a primeira letra?";
    desenharTexto();
    atualizarTeclado();
    atualizarPlaca();
  }

  obterModelo().catch(() => {});
  nova();
  return () => {};
}

// ---------------------------------------------------------------------------
// O gêmeo idêntico: codifica uma frase em posições de palpite e decodifica de volta.
// ---------------------------------------------------------------------------
function gemeo(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O gêmeo idêntico",
    legenda: "O codificador vê a frase e anota em que palpite acertou cada letra. O decodificador nunca vê a frase: recebe só os números e, palpitando exatamente como o codificador, reconstrói o texto.",
  });
  const entrada = h("textarea#c1-gemeo-texto", { rows: 2, "aria-label": "Frase a codificar" });
  entrada.value = "a vida é assim mesmo uma coisa depois da outra";
  const numeros = h("p.bits.gemeo-numeros");
  const saida = h("p.gemeo-saida");
  const placa = leituras([
    { chave: "um", rotulo: "posições iguais a 1", valor: "—" },
    { chave: "max", rotulo: "maior número", valor: "—" },
  ]);
  const btDecodificar = botao("Decodificar só a partir dos números", () => decodificar_(), { variante: "primario" });
  corpo.append(
    h("div", h("label", { for: "c1-gemeo-texto", class: "rotulo-campo" }, "Frase (o codificador vê)"), entrada),
    h("div", h("span.rotulo-campo", "Mensagem enviada: só os números"), numeros),
    placa.el,
    h("div.linha", btDecodificar),
    h("div", h("span.rotulo-campo", "O que o gêmeo reconstrói"), saida)
  );
  avisoModelo(corpo);

  let posicoes = [];
  let animacao = null;

  async function codificar_() {
    const m = await obterModelo();
    const texto = [...entrada.value].map(normalizarChar).join("").replace(/ +/g, " ").trim();
    const cod = codificar(texto);
    posicoes = Array.from(cod, (sim, i) => m.posicaoDoPalpite(cod, sim, 5, i));
    numeros.textContent = posicoes.join(" ");
    const um = posicoes.filter((p) => p === 1).length;
    placa.definir("um", posicoes.length ? fmtPct(um / posicoes.length, 0) : "—");
    placa.definir("max", posicoes.length ? String(Math.max(...posicoes)) : "—");
    saida.textContent = "";
  }

  async function decodificar_() {
    const m = await obterModelo();
    clearInterval(animacao);
    const hist = [];
    let i = 0;
    saida.textContent = "";
    const passo = () => {
      if (i >= posicoes.length) return clearInterval(animacao);
      const p = m.distribuicao(hist, 5);
      const ordem = [...p.keys()].sort((a, b) => p[b] - p[a] || a - b);
      hist.push(ordem[posicoes[i] - 1]);
      saida.textContent = decodificar(hist);
      i++;
    };
    animacao = setInterval(passo, 35);
  }

  let espera;
  entrada.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(codificar_, 250);
  });
  codificar_();
  return () => clearInterval(animacao);
}

// ---------------------------------------------------------------------------
// Placar acumulado: limites de Shannon para você e para a máquina
// ---------------------------------------------------------------------------
function placar(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Seu placar acumulado",
    legenda: "Barras: fração das letras acertadas no 1º, 2º, 3º… palpite, somando todas as frases que você jogou neste navegador. Os limites de Shannon convertem essas frações em bits por letra.",
  });
  const vazio = h("p", "Jogue uma frase completa no jogo acima para ver seu placar aqui.");
  const conteudo = h("div.interativo-corpo");
  const placa = leituras([
    { chave: "frases", rotulo: "frases jogadas", valor: "0" },
    { chave: "voce", rotulo: "você · bits por letra", valor: "—", destaque: true },
    { chave: "maquina", rotulo: "máquina · bits por letra", valor: "—" },
  ]);
  const grafo = h("div.rolagem");
  const apagar = botao("Apagar meu histórico", () => {
    guardarLocal(CHAVE, { rodadas: [] });
    desenhar();
  }, { variante: "discreto" });
  conteudo.append(placa.el, grafo, h("div.linha", apagar));
  corpo.append(vazio, conteudo);

  function desenhar() {
    const rodadas = lerRodadas();
    vazio.hidden = rodadas.length > 0;
    conteudo.hidden = rodadas.length === 0;
    if (!rodadas.length) return;
    const voce = rodadas.flatMap((r) => r.voce);
    const maq = rodadas.flatMap((r) => r.maquina);
    const lv = limitesShannon(voce, K), lm = limitesShannon(maq, K);
    placa.definir("frases", String(rodadas.length));
    placa.definir("voce", `${fmt(lv.inferior, 2)} a ${fmt(lv.superior, 2)}`);
    placa.definir("maquina", `${fmt(lm.inferior, 2)} a ${fmt(lm.superior, 2)}`);

    const N = 10; // 1..9 e "10 ou mais"
    const agrupar = (q) => {
      const out = q.slice(1, N);
      out.push(q.slice(N).reduce((a, b) => a + b, 0));
      return out;
    };
    const qv = agrupar(lv.q), qm = agrupar(lm.q);
    const g = grafico({
      largura: 640, altura: 260, x: [0.5, N + 0.5], y: [0, 1],
      ticksX: [], ticksY: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => fmtPct(v, 0),
      rotuloX: "acertou no palpite número…",
    });
    const larg = (g.x(1) - g.x(0)) * 0.36;
    for (let i = 0; i < N; i++) {
      const xc = g.x(i + 1);
      g.plot.append(
        s("rect", { x: xc - larg, y: g.y(qv[i]), width: larg, height: g.y(0) - g.y(qv[i]), class: "barra realce" }, s("title", {}, `você: ${fmtPct(qv[i])}`)),
        s("rect", { x: xc, y: g.y(qm[i]), width: larg, height: g.y(0) - g.y(qm[i]), class: "barra" }, s("title", {}, `máquina: ${fmtPct(qm[i])}`)),
        s("text", { x: xc, y: g.altura - g.margem.b + 18, class: "tick", "text-anchor": "middle" }, i === N - 1 ? "10+" : String(i + 1))
      );
    }
    const lx = g.largura - g.margem.r - 150;
    g.plot.append(
      s("rect", { x: lx, y: 20, width: 12, height: 12, class: "barra realce" }),
      s("text", { x: lx + 18, y: 30, class: "anotacao" }, "você"),
      s("rect", { x: lx + 70, y: 20, width: 12, height: 12, class: "barra" }),
      s("text", { x: lx + 88, y: 30, class: "anotacao" }, "máquina")
    );
    trocar(grafo, g.svg);
  }
  const ouvir = () => desenhar();
  eventos.addEventListener("rodada", ouvir);
  desenhar();
  return () => eventos.removeEventListener("rodada", ouvir);
}
