// Casca do livro: roteamento por âncora (#c1, #c3-entropia…), sumário, tema, progresso
// de leitura e a página de abertura. Cada capítulo é um fragmento HTML (capitulos/cN.html)
// com um módulo (capitulos/cN.js) que monta os interativos.

import { h, trocar, fita, textoMarcado, reguaSurpresa, lerLocal, guardarLocal, semMovimento, fmt } from "./nucleo/ui.js";
import { obterModelo, trechos, aoProgresso } from "./nucleo/modelo.js";
import { alinhar, codificar } from "./nucleo/alfabeto.js";

export const CAPITULOS = [
  { id: "c1", titulo: "O jogo de adivinhação", desc: "Em 1950, Claude Shannon pediu à esposa que adivinhasse um livro letra por letra. Jogue você também." },
  { id: "c2", titulo: "Perguntas de sim ou não", desc: "O bit como unidade de dúvida. Vinte perguntas, telégrafos e a surpresa de um evento raro." },
  { id: "c3", titulo: "A média da surpresa", desc: "Entropia: quanto, em média, uma fonte ainda tem a dizer. Moedas viciadas e letras do português." },
  { id: "c4", titulo: "O português previsível", desc: "Redundância, cadeias de Markov e um Machado de Assis sintético que fica mais convincente a cada letra de memória." },
  { id: "c5", titulo: "Comprimir é prever", desc: "Códigos de Huffman, codificação aritmética e o limite que nenhum compressor ultrapassa." },
  { id: "c6", titulo: "Conversa no ruído", desc: "Canais que erram, códigos que corrigem e o teorema que pareceu bom demais para ser verdade." },
  { id: "c7", titulo: "Máquinas que adivinham", desc: "Modelos de linguagem jogam o jogo de Shannon. Uma rede neural treinada com Machado roda nesta página." },
];
export const APENDICES = [
  { id: "glossario", titulo: "Glossário" },
  { id: "cartoes", titulo: "Cartões de revisão" },
  { id: "referencias", titulo: "Referências e créditos" },
];
const NOMES = Object.fromEntries([...CAPITULOS, ...APENDICES].map((c) => [c.id, c.titulo]));

const conteudo = document.getElementById("conteudo");
const painel = document.getElementById("sumario-painel");
const botaoSumario = document.getElementById("sumario-botao");
const barra = document.getElementById("progresso");
const raiz = new URL("../", import.meta.url);

// começa a ler Machado já: quando o leitor chegar a um interativo, o modelo estará pronto
obterModelo().catch(() => {});

// ---------- tema ----------
const temaGuardado = lerLocal("tema");
if (temaGuardado) document.documentElement.dataset.theme = temaGuardado;
document.getElementById("tema-botao").addEventListener("click", () => {
  const atual = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const novo = atual === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = novo;
  guardarLocal("tema", novo);
});

// ---------- sumário ----------
function montarSumario(atual) {
  trocar(
    painel,
    h(
      "ol",
      h("li", h("a", { href: "#inicio", "aria-current": atual === "inicio" ? "page" : null }, h("span.num", "·"), h("span", "Abertura"))),
      CAPITULOS.map((c, i) => h("li", h("a", { href: "#" + c.id, "aria-current": atual === c.id ? "page" : null }, h("span.num", String(i + 1)), h("span", c.titulo)))),
      APENDICES.map((c) => h("li", h("a", { href: "#" + c.id, "aria-current": atual === c.id ? "page" : null }, h("span.num", "§"), h("span", c.titulo))))
    )
  );
}
function abrirSumario(abrir) {
  painel.hidden = !abrir;
  botaoSumario.setAttribute("aria-expanded", String(abrir));
}
botaoSumario.addEventListener("click", () => abrirSumario(painel.hidden));
painel.addEventListener("click", (e) => e.target.closest("a") && abrirSumario(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && abrirSumario(false));
document.addEventListener("click", (e) => {
  if (!painel.hidden && !e.target.closest(".topo")) abrirSumario(false);
});

// ---------- progresso de leitura ----------
function atualizarProgresso() {
  const max = document.documentElement.scrollHeight - innerHeight;
  barra.style.width = max > 0 ? (100 * scrollY) / max + "%" : "0";
}
addEventListener("scroll", atualizarProgresso, { passive: true });

// ---------- roteamento ----------
let desmontar = null;
let paginaAtual = null;

function rota() {
  const ancora = decodeURIComponent(location.hash.slice(1)) || "inicio";
  const pagina = ancora.split("-")[0];
  return { pagina: NOMES[pagina] || pagina === "inicio" ? pagina : "inicio", ancora };
}

async function navegar() {
  const { pagina, ancora } = rota();
  abrirSumario(false);
  montarSumario(pagina);
  if (pagina !== paginaAtual) {
    desmontar?.();
    desmontar = null;
    paginaAtual = pagina;
    document.title = pagina === "inicio" ? "A Medida da Surpresa" : `${NOMES[pagina]} · A Medida da Surpresa`;
    try {
      if (pagina === "inicio") desmontar = abertura();
      else if (/^c\d+$/.test(pagina)) desmontar = await carregarCapitulo(pagina);
      else desmontar = await carregarApendice(pagina);
    } catch (err) {
      console.error(err);
      trocar(conteudo, h("p.carregando", "Não consegui abrir esta página. Verifique a conexão e recarregue."));
    }
  }
  const alvo = ancora !== pagina ? document.getElementById(ancora) : null;
  if (alvo) alvo.scrollIntoView();
  else scrollTo(0, 0);
  atualizarProgresso();
  guardarLocal("ultima", pagina);
}

async function buscarFragmento(caminho) {
  const r = await fetch(new URL(caminho, raiz));
  if (!r.ok) throw new Error(caminho + ": " + r.status);
  return r.text();
}

async function carregarCapitulo(id) {
  trocar(conteudo, h("p.carregando", "Abrindo o capítulo…"));
  const html = await buscarFragmento(`capitulos/${id}.html`);
  if (paginaAtual !== id) return null; // o leitor já foi para outro lugar
  conteudo.innerHTML = html;
  const artigo = conteudo.querySelector("article");
  const i = CAPITULOS.findIndex((c) => c.id === id);
  // fita perfurada com o título
  const cabeca = artigo.querySelector(".cap-cabeca");
  cabeca?.prepend(fita(CAPITULOS[i].titulo));
  // navegação entre capítulos
  const ant = CAPITULOS[i - 1], prox = CAPITULOS[i + 1];
  artigo.append(
    h(
      "nav.cap-rodape",
      { "aria-label": "Capítulos" },
      ant ? h("a.anterior", { href: "#" + ant.id }, h("span", `← Capítulo ${i}`), h("strong", ant.titulo)) : h("a.anterior", { href: "#inicio" }, h("span", "← Abertura"), h("strong", "A Medida da Surpresa")),
      prox ? h("a.proximo", { href: "#" + prox.id }, h("span", `Capítulo ${i + 2} →`), h("strong", prox.titulo)) : h("a.proximo", { href: "#cartoes" }, h("span", "Apêndice →"), h("strong", "Cartões de revisão"))
    )
  );
  conteudo.focus({ preventScroll: true });
  const mod = await import(new URL(`capitulos/${id}.js`, raiz).href);
  const fim = await mod.montar?.(artigo);
  return typeof fim === "function" ? fim : null;
}

async function carregarApendice(id) {
  trocar(conteudo, h("p.carregando", "Abrindo…"));
  const html = await buscarFragmento(`paginas/${id}.html`);
  if (paginaAtual !== id) return null;
  conteudo.innerHTML = html;
  const artigo = conteudo.querySelector("article");
  let mod = null;
  try {
    mod = await import(new URL(`paginas/${id}.js`, raiz).href);
  } catch {}
  const fim = await mod?.montar?.(artigo, { CAPITULOS, raiz });
  return typeof fim === "function" ? fim : null;
}

// ---------- abertura ----------
function abertura() {
  let vivo = true;
  const ultima = lerLocal("ultima");
  const frase = h("div.vitrine-texto");
  const fonte = h("cite");
  const status = h("span", { role: "status" });
  const proxima = h("button.botao.discreto", { type: "button" }, "Outra frase");
  const media = h("span.dados");

  trocar(
    conteudo,
    h(
      "div.abertura",
      fita("A medida da surpresa"),
      h("h1", "A Medida da ", h("em", "Surpresa")),
      h("p.subtitulo", "Um livro interativo de teoria da informação, do jogo de adivinhação de Claude Shannon aos modelos de linguagem, usando a obra de Machado de Assis como laboratório."),
      h(
        "section.vitrine",
        { "aria-label": "Demonstração" },
        frase,
        h("div.vitrine-pe", h("span", fonte, " · ", media, " ", status), h("span.linha", reguaSurpresa(10), proxima))
      ),
      h(
        "p",
        { style: { maxWidth: "40rem", color: "var(--tinta-2)" } },
        "Cada letra da frase acima foi marcada pela surpresa que causou a um programa que leu nove romances de Machado e tenta adivinhar a próxima letra. Onde ele acerta com folga, o papel fica limpo. Onde ele não esperava aquela letra, o marca-texto aparece. A frase vem de ",
        h("i", "Memorial de Aires"),
        ", o último romance, que o programa nunca leu. Medir essa surpresa em bits é o assunto deste livro."
      ),
      ultima && ultima !== "inicio" && NOMES[ultima] ? h("p", h("a", { href: "#" + ultima }, `Continuar de onde parou: ${NOMES[ultima]} →`)) : null,
      h(
        "ol.indice",
        CAPITULOS.map((c, i) => h("li", h("a", { href: "#" + c.id }, h("span.num", String(i + 1).padStart(2, "0")), h("strong", c.titulo), h("span.desc", c.desc))))
      ),
      h("div.apendices", APENDICES.map((a) => h("a", { href: "#" + a.id }, a.titulo)))
    ),
    h(
      "footer.colofao",
      h("p", "Escrito e programado por Claude (Anthropic) em uma única sessão, em outubro de 2026. Textos de Machado de Assis em domínio público. Tudo roda no seu navegador; nada do que você digitar sai daqui.")
    )
  );

  let lista = [];
  let k = 0;
  const pintar = async () => {
    const t = lista[k % lista.length];
    fonte.textContent = "Memorial de Aires (1908)";
    trocar(frase, h("p.marcado", t.original));
    const m = await obterModelo();
    if (!vivo) return;
    const { normalizado } = alinhar(t.original);
    const sup = m.surpresas(codificar(normalizado));
    const { el } = textoMarcado(t.original, sup);
    if (!semMovimento()) {
      // o marca-texto passa da esquerda para a direita
      const spans = [...el.querySelectorAll(".letra")];
      const alvos = spans.map((s) => s.style.getPropertyValue("--s"));
      spans.forEach((s) => s.style.setProperty("--s", "0"));
      trocar(frase, el);
      spans.forEach((s, i) => setTimeout(() => s.style.setProperty("--s", alvos[i]), 18 * i));
    } else trocar(frase, el);
    const mediaBits = sup.reduce((a, b) => a + b, 0) / sup.length;
    media.textContent = `${fmt(mediaBits, 2)} bits por letra, em média`;
    status.textContent = "";
  };
  const desligar = aoProgresso((e) => {
    if (e.fase === "lendo") status.textContent = "· lendo Machado…";
    else if (e.fase === "contando") status.textContent = "· contando letras…";
    else if (e.fase === "erro") status.textContent = "· não consegui carregar o corpus";
  });
  proxima.addEventListener("click", () => {
    k++;
    pintar();
  });
  trechos().then((d) => {
    // frases favoritas primeiro, depois sorteio
    const fav = d.frases.filter((f) => /Carmo possuía|transfusão desapareciam|A vida é assim|velhice/.test(f.original));
    const resto = d.frases.filter((f) => !fav.includes(f)).sort(() => Math.random() - 0.5);
    lista = [...fav.slice(0, 1), ...resto];
    if (vivo) pintar();
  });
  return () => {
    vivo = false;
    desligar();
  };
}

addEventListener("hashchange", navegar);
navegar();
