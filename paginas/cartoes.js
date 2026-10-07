// Cartões de revisão: reúne os <dl class="cartoes-dados"> de todos os capítulos.
import { h, trocar, moldura, botao, seletor, lerLocal, guardarLocal, copiar } from "../assets/nucleo/ui.js";

const CHAVE = "cartoes-caixas"; // { [id do cartão]: { caixa: 0..4, vence: número da sessão } }

async function reunir(CAPITULOS, raiz) {
  const todos = [];
  await Promise.all(
    CAPITULOS.map(async (c, i) => {
      const r = await fetch(new URL(`capitulos/${c.id}.html`, raiz));
      if (!r.ok) return;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const dts = doc.querySelectorAll(".cartoes-dados dt");
      dts.forEach((dt, k) => {
        const dd = dt.nextElementSibling;
        todos.push({ id: `${c.id}-${k}`, cap: i + 1, titulo: c.titulo, p: limpo(dt), r: limpo(dd) });
      });
    })
  );
  return todos.sort((a, b) => a.cap - b.cap || a.id.localeCompare(b.id, "pt", { numeric: true }));
}
const limpo = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export async function montar(artigo, { CAPITULOS, raiz }) {
  const cartoes = await reunir(CAPITULOS, raiz);
  // lista completa
  const porCap = new Map();
  for (const c of cartoes) {
    if (!porCap.has(c.cap)) porCap.set(c.cap, []);
    porCap.get(c.cap).push(c);
  }
  trocar(
    artigo.querySelector("#cartoes-todos"),
    [...porCap].map(([cap, lista]) => [
      h("h3", h("a", { href: "#c" + cap }, `Capítulo ${cap} · ${lista[0].titulo}`)),
      h("ul.cartao-lista", lista.map((c) => h("li", h("div.p", c.p), h("div.r", c.r)))),
    ])
  );
  revisao(artigo.querySelector('[data-widget="revisao"]'), cartoes);
  exportar(artigo.querySelector('[data-widget="exportar"]'), cartoes);
}

// Revisão por caixas de Leitner: a caixa n volta depois de 2^n rodadas.
function revisao(fig, cartoes) {
  const { corpo } = moldura(fig, { titulo: "Revisão", legenda: "Caixas de Leitner: cada acerto adia o cartão (1, 2, 4, 8, 16 rodadas); cada erro o traz de volta para a primeira caixa." });
  let estado = lerLocal(CHAVE, {}) ?? {};
  let rodada = lerLocal(CHAVE + "-rodada", 0) ?? 0;
  let filtro = "todos";
  const frente = h("div.rev-pergunta");
  const verso = h("div.rev-resposta");
  const meta = h("p.rev-meta");
  const caixas = h("div.rev-caixas", { "aria-label": "Cartões por caixa" });
  const btVirar = botao("Virar o cartão", () => virar(), { variante: "primario" });
  const btSabia = botao("Sabia", () => marcar(true), { variante: "primario" });
  const btNao = botao("Não sabia", () => marcar(false));
  const capitulos = [...new Set(cartoes.map((c) => c.cap))];
  const sel = seletor([{ valor: "todos", rotulo: "Todos" }, ...capitulos.map((c) => ({ valor: c, rotulo: "Cap. " + c }))], "todos", (v) => {
    filtro = v;
    proximo();
  }, { rotuloAria: "Capítulos" });
  const cartao = h("div.rev-cartao", meta, frente, verso);
  corpo.append(sel.el, cartao, h("div.linha", btVirar, btSabia, btNao), caixas);

  let atual = null;
  const caixaDe = (c) => estado[c.id]?.caixa ?? 0;
  function proximo() {
    const pool = cartoes.filter((c) => filtro === "todos" || c.cap === filtro);
    const devidos = pool.filter((c) => (estado[c.id]?.vence ?? 0) <= rodada);
    const escolha = devidos.length ? devidos : pool;
    // prioriza caixas baixas, com algum sorteio
    escolha.sort((a, b) => caixaDe(a) - caixaDe(b) || Math.random() - 0.5);
    atual = escolha[0];
    frente.textContent = atual.p;
    verso.textContent = atual.r;
    verso.hidden = true;
    btVirar.hidden = false;
    btSabia.hidden = btNao.hidden = true;
    meta.textContent = `Capítulo ${atual.cap} · caixa ${caixaDe(atual) + 1} de 5`;
    desenharCaixas(pool);
  }
  function virar() {
    verso.hidden = false;
    btVirar.hidden = true;
    btSabia.hidden = btNao.hidden = false;
    btSabia.focus();
  }
  function marcar(sabia) {
    rodada++;
    const cx = sabia ? Math.min(caixaDe(atual) + 1, 4) : 0;
    estado[atual.id] = { caixa: cx, vence: rodada + 2 ** cx };
    guardarLocal(CHAVE, estado);
    guardarLocal(CHAVE + "-rodada", rodada);
    proximo();
  }
  function desenharCaixas(pool) {
    const n = [0, 0, 0, 0, 0];
    for (const c of pool) n[caixaDe(c)]++;
    trocar(caixas, n.map((k, i) => h("div.rev-caixa", h("span.rev-caixa-n", String(k)), h("span", `caixa ${i + 1}`))));
  }
  proximo();
}

function exportar(fig, cartoes) {
  const { corpo } = moldura(fig, { titulo: "Exportar" });
  let obsidian = "#flashcards/medida-da-surpresa\n";
  let cap = 0;
  for (const c of cartoes) {
    if (c.cap !== cap) {
      cap = c.cap;
      obsidian += `\n## Capítulo ${cap} · ${c.titulo}\n`;
    }
    obsidian += `\n${c.p}\n?\n${c.r}\n`;
  }
  const anki = cartoes.map((c) => `${c.p.replace(/\t/g, " ")}\t${c.r.replace(/\t/g, " ")}\tcapitulo-${c.cap}`).join("\n") + "\n";
  let formato = "obsidian";
  const pre = h("pre.saida", { tabindex: "0" });
  const aviso = h("span.rev-meta", { role: "status" });
  const mostrar = () => (pre.textContent = formato === "obsidian" ? obsidian : anki);
  const sel = seletor([{ valor: "obsidian", rotulo: "Obsidian (Markdown)" }, { valor: "anki", rotulo: "Anki (tabulações)" }], formato, (v) => {
    formato = v;
    mostrar();
    aviso.textContent = "";
  }, { rotuloAria: "Formato" });
  const bt = botao("Copiar", async () => {
    const ok = await copiar(pre.textContent, pre);
    aviso.textContent = ok ? `${cartoes.length} cartões copiados.` : "Seu navegador não deixou copiar. O texto está selecionado: use Ctrl+C ou ⌘C.";
  }, { variante: "primario" });
  corpo.append(h("div.linha", sel.el, bt, aviso), pre);
  mostrar();
}
