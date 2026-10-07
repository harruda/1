// Capítulo 7 — Máquinas que adivinham
import {
  h, s, trocar, moldura, botao, deslizante, seletor, leituras, avisoModelo, fmt, fmtPct, fmtInt,
  grafico, caminho, textoMarcado, reguaSurpresa, lerLocal, semMovimento,
} from "../assets/nucleo/ui.js";
import { ALFABETO, K, codificar, decodificar, normalizar, normalizarChar, rotulo, alinhar } from "../assets/nucleo/alfabeto.js";
import { obterModelo, trechos, textoTeste } from "../assets/nucleo/modelo.js";
import { obterRede, aplicarTemperatura } from "../assets/nucleo/rede.js";
import { entropia, entropiaCruzada, divergenciaKL, limitesShannon, criarRng } from "../assets/nucleo/info.js";

export async function montar(raiz) {
  const limpar = [];
  const mapa = { kl, treino, duelo, atencao, gerar, revanche };
  for (const fig of raiz.querySelectorAll("[data-widget]")) {
    const f = mapa[fig.dataset.widget];
    if (f) limpar.push(f(fig));
  }
  obterRede()
    .then((r) => raiz.querySelectorAll('[data-rede="parametros"]').forEach((el) => (el.textContent = fmtInt(r.parametros))))
    .catch(() => {});
  return () => limpar.forEach((f) => f?.());
}

/** Mostra o carregamento da rede num elemento. */
function avisoRede(el) {
  const msg = h("p.aviso-modelo", { role: "status" }, "Carregando o Machadinho (2 MB de pesos)…");
  el.append(msg);
  obterRede().then(
    () => msg.remove(),
    () => (msg.textContent = "Não consegui carregar a rede. Recarregue a página para tentar de novo.")
  );
  return msg;
}

const media = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

// ---------------------------------------------------------------------------
// O preço do erro: entropia, entropia cruzada e KL com uma moeda
// ---------------------------------------------------------------------------
function kl(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O preço do erro",
    legenda: "A moeda verdadeira dá cara com probabilidade p; o modelo acredita que é q. A barra mostra quanto o modelo paga por lançamento: a parte escura é o mínimo inevitável (a entropia da moeda), a parte amarela é o desperdício (a divergência KL). A curva mostra o custo para cada crença q possível; o mínimo fica exatamente em q = p.",
  });
  let p = 0.9, q = 0.5;
  const sp = deslizante({ id: "c7-kl-p", rotulo: "moeda verdadeira, p(cara)", min: 0.01, max: 0.99, passo: 0.01, valor: p, aoMudar: (v) => ((p = v), desenhar()) });
  const sq = deslizante({ id: "c7-kl-q", rotulo: "crença do modelo, q(cara)", min: 0.01, max: 0.99, passo: 0.01, valor: q, aoMudar: (v) => ((q = v), desenhar()) });
  const placa = leituras([
    { chave: "h", rotulo: "mínimo H(p)", valor: "" },
    { chave: "hc", rotulo: "o modelo paga H(p,q)", valor: "", destaque: true },
    { chave: "d", rotulo: "desperdício D(p‖q)", valor: "" },
  ]);
  const barra = h("div.kl-barra", h("span.kl-min"), h("span.kl-desp"));
  const escalaBarra = h("div.kl-escala", h("span", "0"), h("span", "1 bit"), h("span", "2 bits"), h("span", "3 bits"));
  const graf = h("div");
  corpo.append(h("div.colunas", h("div.interativo-corpo", sp.el, sq.el), placa.el), h("div", barra, escalaBarra), graf);

  function desenhar() {
    const P = [p, 1 - p], Q = [q, 1 - q];
    const H = entropia(P), HC = entropiaCruzada(P, Q), D = divergenciaKL(P, Q);
    placa.definir("h", fmt(H, 3) + " bit");
    placa.definir("hc", fmt(HC, 3) + " bit");
    placa.definir("d", fmt(D, 3) + " bit");
    const max = 3;
    barra.children[0].style.width = (100 * Math.min(H, max)) / max + "%";
    barra.children[1].style.width = (100 * Math.min(D, max - Math.min(H, max))) / max + "%";

    const g = grafico({ largura: 640, altura: 220, x: [0, 1], y: [0, 3], rotuloX: "crença do modelo q(cara)", rotuloY: "bits por lançamento", ticksX: [0, 0.25, 0.5, 0.75, 1], fmtX: (v) => fmt(v, 2) });
    const pts = [];
    for (let i = 1; i < 400; i++) {
      const x = i / 400, y = entropiaCruzada(P, [x, 1 - x]);
      if (y <= 3) pts.push([g.x(x), g.y(y)]);
    }
    const esquerda = p > 0.5;
    g.plot.append(
      s("line", { x1: g.x(0), x2: g.x(1), y1: g.y(H), y2: g.y(H), class: "referencia" }),
      s("text", { x: esquerda ? g.x(0) + 6 : g.x(1) - 6, y: g.y(H) - 6, class: "anotacao-dados", "text-anchor": esquerda ? "start" : "end" }, "mínimo H(p) = " + fmt(H, 2)),
      s("path", { d: caminho(pts), class: "linha-dados" }),
      HC <= 3 ? s("line", { x1: g.x(q), x2: g.x(q), y1: g.y(H), y2: g.y(HC), class: "kl-segmento" }) : null,
      HC <= 3 ? s("circle", { cx: g.x(q), cy: g.y(HC), r: 5, class: "ponto" }) : null
    );
    trocar(graf, g.svg);
  }
  desenhar();
}

// ---------------------------------------------------------------------------
// Curva de treino da rede contra os modelos de contagem
// ---------------------------------------------------------------------------
function treino(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O treino do Machadinho",
    legenda: "Entropia cruzada (bits por letra) nas primeiras 20 mil letras de Memorial de Aires, que a rede nunca viu, medida a cada 250 passos de treino. Cada passo mostra à rede 64 trechos de 128 letras. As linhas tracejadas são o modelo de contagens com 1 a 5 letras de memória, medido nas mesmas 20 mil letras.",
  });
  const graf = h("div");
  const placa = leituras([
    { chave: "rede", rotulo: "Machadinho", valor: "…", destaque: true },
    { chave: "ng", rotulo: "contagens, 5 letras", valor: "…" },
    { chave: "par", rotulo: "parâmetros", valor: "…" },
  ]);
  corpo.append(placa.el, graf);
  avisoModelo(corpo);

  Promise.all([fetch(new URL("../dados/machadinho-treino.json", import.meta.url)).then((r) => r.json()), obterModelo(), textoTeste()]).then(([dados, m, teste]) => {
    const cod = codificar(teste.slice(0, 20000));
    const ng = [1, 2, 3, 4, 5].map((o) => ({ o, h: m.entropiaCruzada(cod, o) }));
    placa.definir("rede", fmt(dados.historico.at(-1).teste, 2) + " bits/letra");
    placa.definir("ng", fmt(ng[4].h, 2) + " bits/letra");
    placa.definir("par", fmtInt(dados.parametros));
    const hist = dados.historico;
    const xmax = hist.at(-1).passo;
    const g = grafico({ largura: 680, altura: 300, margem: { t: 16, r: 34, b: 44, l: 52 }, x: [0, xmax], y: [1.5, 3.5], rotuloX: "passos de treino", rotuloY: "bits por letra", ticksY: [1.5, 2, 2.5, 3, 3.5], fmtX: (v) => fmtInt(v), fmtY: (v) => fmt(v, 1) });
    for (const { o, h: hb } of ng) {
      if (hb > 3.5) continue;
      g.plot.append(
        s("line", { x1: g.x(0), x2: g.x(xmax), y1: g.y(hb), y2: g.y(hb), class: "referencia" }),
        s("text", { x: g.x(xmax) - 4, y: g.y(hb) + (o === 5 ? 15 : -5), class: "anotacao-dados", "text-anchor": "end" }, `contagens, ${o} ${o === 1 ? "letra" : "letras"}: ${fmt(hb, 2)}`)
      );
    }
    const pts = hist.filter((p) => p.teste <= 3.5).map((p) => [g.x(p.passo), g.y(p.teste)]);
    const ult = hist.at(-1);
    g.plot.append(
      s("path", { d: caminho(pts), class: "linha-dados" }),
      s("circle", { cx: g.x(ult.passo), cy: g.y(ult.teste), r: 5, class: "ponto" }),
      s("text", { x: g.x(ult.passo * 0.55), y: g.y(ult.teste) + 30, class: "anotacao", "text-anchor": "middle" }, `Machadinho: ${fmt(ult.teste, 2)}`)
    );
    trocar(graf, h("div.rolagem", g.svg));
  });
}

// ---------------------------------------------------------------------------
// Duelo: n-gramas x rede na mesma frase
// ---------------------------------------------------------------------------
function duelo(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Duelo de adivinhadores",
    legenda: "Cada letra é pintada pela surpresa que causou a cada modelo. Passe o dedo ou o mouse sobre uma letra para ver o valor exato. A média de bits por letra é a entropia cruzada do modelo nesta frase.",
  });
  const entrada = h("textarea#c7-duelo-texto", { rows: 2, "aria-label": "Frase para os dois modelos" });
  const outra = botao("Outra frase de Memorial de Aires", () => sortear());
  const linhaNg = h("div.duelo-linha");
  const linhaRede = h("div.duelo-linha");
  const mNg = h("span.duelo-media"), mRede = h("span.duelo-media");
  corpo.append(
    entrada,
    h("div.linha", outra, reguaSurpresa(10)),
    h("div.duelo-bloco", h("div.duelo-cab", h("strong", "Contagens"), h("span", " · 5 letras de memória · "), mNg), linhaNg),
    h("div.duelo-bloco", h("div.duelo-cab", h("strong", "Machadinho"), h("span", " · rede neural, 128 letras de memória · "), mRede), linhaRede)
  );
  avisoModelo(corpo);
  avisoRede(corpo);

  let frases = [];
  let espera;
  async function pintar() {
    const original = entrada.value.slice(0, 400);
    const [m, rede] = await Promise.all([obterModelo(), obterRede()]);
    const { normalizado } = alinhar(original);
    if (!normalizado) {
      trocar(linhaNg);
      trocar(linhaRede);
      return;
    }
    const cod = codificar(normalizado);
    const sNg = m.surpresas(cod, 5);
    const sRede = rede.surpresas(cod);
    trocar(linhaNg, textoMarcado(original, sNg).el);
    trocar(linhaRede, textoMarcado(original, sRede).el);
    mNg.textContent = fmt(media(sNg), 2) + " bits/letra";
    mRede.textContent = fmt(media(sRede), 2) + " bits/letra";
  }
  async function sortear() {
    if (!frases.length) frases = (await trechos()).frases.filter((f) => f.normalizado.length < 140);
    entrada.value = frases[Math.floor(Math.random() * frases.length)].original;
    pintar();
  }
  entrada.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(pintar, 200);
  });
  entrada.value = "Não emendo esta frase, tive inveja aos dois, porque naquela transfusão desapareciam os sexos diferentes para só ficar um estado único.";
  pintar();
  return () => clearTimeout(espera);
}

// ---------------------------------------------------------------------------
// Atenção: para onde cada cabeça olha
// ---------------------------------------------------------------------------
function atencao(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Para onde a rede olha",
    legenda: "Escolha uma letra (toque ou passe o mouse; no teclado, use as setas). As letras anteriores ficam azuis na proporção do peso que a cabeça escolhida deu a cada uma ao ler a letra marcada. A grade mostra o padrão das dezesseis cabeças para a mesma letra; toque numa para selecioná-la. Por fim, as letras que a rede, naquele ponto, esperava a seguir.",
  });
  const frase = h("div.at-frase", { tabindex: "0", role: "listbox", "aria-label": "Letras da frase" });
  const grade = h("div.at-grade");
  const previsao = h("div.at-previsao");
  const titulo = h("p.at-info");
  const outra = botao("Outra frase", () => sortear());
  corpo.append(h("div.linha", outra, titulo), frase, h("div.at-baixo", grade, previsao));
  avisoRede(corpo);

  let texto = "", atencoes = [], dists = [], sel = 0, cam = 0, cab = 0, celulas = [];

  function escolherCabecaInteressante() {
    // a cabeça cuja atenção média vai mais longe para trás
    let melhor = [0, 0], dmax = -1;
    for (let l = 0; l < atencoes[0].length; l++)
      for (let c = 0; c < atencoes[0][l].length; c++) {
        let soma = 0;
        for (let t = 1; t < atencoes.length; t++) {
          const w = atencoes[t][l][c];
          let d = 0;
          for (let j = 0; j < w.length; j++) d += w[j] * (t - j);
          soma += d;
        }
        if (soma > dmax) {
          dmax = soma;
          melhor = [l, c];
        }
      }
    return melhor;
  }

  async function carregar(t) {
    const rede = await obterRede();
    texto = t;
    const cod = codificar(texto);
    const sess = rede.sessao({ registrarAtencao: true });
    dists = [sess.alimentar(0)];
    for (const c of cod) dists.push(sess.alimentar(c));
    atencoes = sess.atencao; // atencoes[t]: lendo a posição t (0 = espaço inicial, t = letra t−1)
    [cam, cab] = escolherCabecaInteressante();
    celulas = [h("span.at-letra.at-inicio", { "data-t": 0, title: "início" }, "·"), ...[...texto].map((c, i) => h("span.at-letra", { "data-t": i + 1, role: "option" }, c === " " ? " " : c))];
    // agrupa as letras por palavra, para a quebra de linha não partir palavras
    const palavras = [];
    let atual = h("span.at-palavra");
    celulas.forEach((el, t) => {
      atual.append(el);
      if (t > 0 && texto[t - 1] === " ") {
        palavras.push(atual);
        atual = h("span.at-palavra");
      }
    });
    palavras.push(atual);
    trocar(frase, palavras);
    sel = Math.min(Math.round(texto.length * 0.6), texto.length);
    // começa num fim de palavra, onde a atenção costuma ficar interessante
    while (sel < texto.length && texto[sel] !== " ") sel++;
    desenhar();
  }

  function desenhar() {
    const pesos = atencoes[sel][cam][cab];
    let max = 0;
    for (const w of pesos) max = Math.max(max, w);
    celulas.forEach((el, t) => {
      el.classList.toggle("at-sel", t === sel);
      el.style.setProperty("--w", t <= sel ? (pesos[t] / max).toFixed(3) : "0");
      el.classList.toggle("at-futuro", t > sel);
    });
    const lida = sel === 0 ? "o início" : `“${rotulo(texto[sel - 1])}”`;
    titulo.textContent = `Camada ${cam + 1}, cabeça ${cab + 1}, lendo ${lida}`;

    // grade 4×4 de miniaturas
    const L = atencoes[sel].length, C = atencoes[sel][0].length;
    const mini = [];
    for (let l = 0; l < L; l++)
      for (let c = 0; c < C; c++) {
        const w = atencoes[sel][l][c];
        const n = Math.min(w.length, 24);
        const larg = 96, alt = 28, bw = larg / 24;
        const svg = s("svg", { viewBox: `0 0 ${larg} ${alt}`, class: "at-mini-svg", "aria-hidden": "true" });
        for (let j = 0; j < n; j++) {
          const v = w[w.length - n + j];
          svg.append(s("rect", { x: larg - (n - j) * bw, y: alt - v * alt, width: bw - 0.5, height: Math.max(0.5, v * alt), class: "at-mini-barra" }));
        }
        mini.push(
          h("button.at-mini", {
            type: "button",
            "aria-pressed": String(l === cam && c === cab),
            title: `camada ${l + 1}, cabeça ${c + 1}`,
            on: { click: () => { cam = l; cab = c; desenhar(); } },
          }, svg, h("span", `${l + 1}·${c + 1}`))
        );
      }
    trocar(grade, h("div.at-grade-rotulo", "as 16 cabeças (últimas 24 letras)"), h("div.at-grade-itens", mini));

    // previsão
    const p = dists[sel];
    const top = [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, 6);
    const real = sel < texto.length ? texto[sel] : null;
    trocar(
      previsao,
      h("div.at-grade-rotulo", "a rede esperava"),
      top.map((c) =>
        h("div.at-prev" + (ALFABETO[c] === real ? ".at-real" : ""), h("span.at-prev-c", rotulo(c)), h("span.at-prev-b", h("span", { style: { width: (100 * p[c]).toFixed(1) + "%" } })), h("span.at-prev-v", fmtPct(p[c], 0)))
      ),
      real ? h("p.at-info", `veio “${rotulo(real)}”: ${fmt(-Math.log2(p[codificar(real)[0]]), 1)} bits de surpresa`) : null
    );
  }

  const escolher = (e) => {
    const el = e.target.closest(".at-letra");
    if (el) {
      sel = +el.dataset.t;
      desenhar();
    }
  };
  frase.addEventListener("pointerover", escolher);
  frase.addEventListener("click", escolher);
  frase.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") sel = Math.min(sel + 1, texto.length);
    else if (e.key === "ArrowLeft") sel = Math.max(sel - 1, 0);
    else return;
    e.preventDefault();
    desenhar();
  });

  let frases = [];
  async function sortear() {
    if (!frases.length) frases = (await trechos()).frases.filter((f) => f.normalizado.length <= 110);
    carregar(frases[Math.floor(Math.random() * frases.length)].normalizado);
  }
  carregar("carmo possuía todas as espécies de ternura a conjugal a filial a maternal");
}

// ---------------------------------------------------------------------------
// Geração com temperatura
// ---------------------------------------------------------------------------
function gerar(fig) {
  const { corpo } = moldura(fig, {
    titulo: "O Machadinho escreve",
    legenda: "A rede sorteia uma letra por vez. As barras mostram, a cada instante, as candidatas mais prováveis depois da temperatura. O começo é opcional: a rede continua a partir dele.",
  });
  let T = 0.8;
  const temp = deslizante({ id: "c7-temperatura", rotulo: "temperatura", min: 0.1, max: 1.6, passo: 0.05, valor: T, aoMudar: (v) => (T = v) });
  const inicio = h("input#c7-inicio", { type: "text", value: "capitu", "aria-label": "Começo do texto", maxlength: 60 });
  const btEscrever = botao("Escrever", () => escrever(), { variante: "primario" });
  const saida = h("p.gerar-saida", { "aria-live": "polite" });
  const barras = h("div.gerar-barras", { "aria-hidden": "true" });
  corpo.append(
    h("div.linha", h("label.gerar-campo", { for: "c7-inicio" }, h("span.rotulo-campo", "começo"), inicio), h("div.gerar-temp", temp.el), btEscrever),
    h("div.gerar-area", saida, barras)
  );
  avisoRede(corpo);

  let timer = null;
  async function escrever() {
    const rede = await obterRede();
    clearTimeout(timer);
    const pref = normalizar(inicio.value);
    const rng = criarRng((Math.random() * 2 ** 32) >>> 0);
    const sess = rede.sessao();
    let p = sess.alimentar(0);
    for (const c of codificar(pref)) p = sess.alimentar(c);
    const pre = h("span.gerar-prefixo", pref);
    const novo = h("span");
    trocar(saida, pre, novo);
    let n = 0;
    const total = 320;
    const passo = () => {
      const lote = semMovimento() ? total : 3;
      for (let k = 0; k < lote && n < total; k++, n++) {
        const q = aplicarTemperatura(p, T);
        let r = rng(), c = 0;
        for (; c < K - 1; c++) {
          r -= q[c];
          if (r < 0) break;
        }
        novo.textContent += ALFABETO[c];
        mostrarBarras(q, c);
        p = sess.alimentar(c);
      }
      if (n < total) timer = setTimeout(passo, 30);
    };
    passo();
  }
  function mostrarBarras(q, escolhida) {
    const top = [...q.keys()].sort((a, b) => q[b] - q[a]).slice(0, 5);
    trocar(
      barras,
      top.map((c) => h("div.at-prev" + (c === escolhida ? ".at-real" : ""), h("span.at-prev-c", rotulo(c)), h("span.at-prev-b", h("span", { style: { width: (100 * q[c]).toFixed(1) + "%" } })), h("span.at-prev-v", fmtPct(q[c], 0))))
    );
  }
  escrever();
  return () => clearTimeout(timer);
}

// ---------------------------------------------------------------------------
// Revanche: você x contagens x rede nas frases do capítulo 1
// ---------------------------------------------------------------------------
function revanche(fig) {
  const { corpo } = moldura(fig, {
    titulo: "Placar: você, as contagens e a rede",
    legenda: "Palpites por letra no jogo de Shannon, nas mesmas frases. Para as máquinas, o número de palpites é a posição da letra certa na lista de letras ordenada pela probabilidade que cada uma lhe deu.",
  });
  const tabela = h("div.rolagem");
  const aviso = h("p.revanche-aviso");
  corpo.append(aviso, tabela);
  avisoModelo(corpo);
  avisoRede(corpo);

  (async () => {
    const rodadas = lerLocal("jogo-shannon", { rodadas: [] }).rodadas ?? [];
    const [m, rede] = await Promise.all([obterModelo(), obterRede()]);
    let frases, voce = null;
    if (rodadas.length) {
      frases = rodadas.map((r) => r.frase);
      voce = rodadas.flatMap((r) => r.voce);
      trocar(aviso, `Usando as ${rodadas.length === 1 ? "frase" : rodadas.length + " frases"} que você jogou no capítulo 1.`);
    } else {
      const d = await trechos();
      const rng = criarRng(1908);
      frases = Array.from({ length: 8 }, () => d.frases[Math.floor(rng() * d.frases.length)].normalizado);
      trocar(aviso, "Você ainda não jogou no capítulo 1, então o placar usa oito frases sorteadas de Memorial de Aires só com as máquinas. ", h("a", { href: "#c1-jogue" }, "Jogue uma frase"), " e volte.");
    }
    const ng = [], rd = [];
    for (const f of frases) {
      const cod = codificar(f);
      const ds = rede.distribuicoes(cod);
      for (let i = 0; i < cod.length; i++) {
        ng.push(m.posicaoDoPalpite(cod, cod[i], 5, i));
        const p = ds[i];
        let pos = 1;
        for (let t = 0; t < K; t++) if (p[t] > p[cod[i]] || (p[t] === p[cod[i]] && t < cod[i])) pos++;
        rd.push(pos);
      }
    }
    const linhas = [voce && ["Você", voce], ["Contagens (5 letras)", ng], ["Machadinho", rd]].filter(Boolean);
    trocar(
      tabela,
      h(
        "table.revanche",
        h("thead", h("tr", h("th", ""), h("th", "acertos de primeira"), h("th", "palpites por letra"), h("th", "limites de Shannon (bits/letra)"))),
        h(
          "tbody",
          linhas.map(([nome, a]) => {
            const l = limitesShannon(a, K);
            return h("tr", h("th", nome), h("td", fmtPct(a.filter((x) => x === 1).length / a.length, 0)), h("td", fmt(media(a), 2)), h("td", `${fmt(l.inferior, 2)} a ${fmt(l.superior, 2)}`));
          })
        )
      )
    );
  })();
}
