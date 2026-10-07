// Acesso único ao modelo de Machado de Assis. Treinado uma vez por visita,
// em segundo plano, e compartilhado por todos os capítulos.
import { codificar } from "./alfabeto.js";
import { contar, ModeloNgramas } from "./ngramas.js";

export const ORDEM_MAX = 5;
const BASE = new URL("../../dados/", import.meta.url);
const URL_TREINO = new URL("machado-treino.txt", BASE).href;
const URL_TESTE = new URL("machado-teste.txt", BASE).href;
const URL_TRECHOS = new URL("trechos.json", BASE).href;

let promessa = null;
const ouvintes = new Set();
export const estado = { fase: "parado", ordem: -1 };

function avisar(fase, extra = {}) {
  Object.assign(estado, { fase }, extra);
  for (const f of ouvintes) f({ ...estado });
}

/** Recebe atualizações de progresso do treino: { fase: "lendo"|"contando"|"pronto"|"erro", ordem }. */
export function aoProgresso(f) {
  ouvintes.add(f);
  f({ ...estado });
  return () => ouvintes.delete(f);
}

async function treinarAqui() {
  avisar("lendo");
  const texto = await (await fetch(URL_TREINO)).text();
  avisar("contando", { ordem: -1 });
  const m = new ModeloNgramas(contar(codificar(texto), ORDEM_MAX, (o) => avisar("contando", { ordem: o })));
  return m;
}

function treinarNoWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker(new URL("./modelo-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      reject(err);
      return;
    }
    avisar("lendo");
    w.onmessage = (e) => {
      const d = e.data;
      if (d.tipo === "lido") avisar("contando", { ordem: -1 });
      else if (d.tipo === "ordem") avisar("contando", { ordem: d.ordem });
      else if (d.tipo === "pronto") {
        resolve(ModeloNgramas.deMensagem(d.modelo));
        w.terminate();
      } else if (d.tipo === "erro") {
        reject(new Error(d.mensagem));
        w.terminate();
      }
    };
    w.onerror = (e) => {
      reject(e);
      w.terminate();
    };
    w.postMessage({ url: URL_TREINO, ordemMax: ORDEM_MAX });
  });
}

/** Promessa do modelo de n-gramas (ordens 0..5) treinado nos nove romances. */
export function obterModelo() {
  if (!promessa) {
    promessa = treinarNoWorker()
      .catch(() => treinarAqui())
      .then((m) => {
        avisar("pronto", { ordem: ORDEM_MAX });
        return m;
      })
      .catch((err) => {
        avisar("erro", { mensagem: String(err) });
        promessa = null;
        throw err;
      });
  }
  return promessa;
}

const cache = {};
function buscar(chave, url, conv) {
  if (!cache[chave]) cache[chave] = fetch(url).then((r) => (r.ok ? r : Promise.reject(new Error(url)))).then(conv);
  return cache[chave];
}

/** Texto normalizado dos nove romances de treino (string, ~2,6 milhões de caracteres). */
export const textoTreino = () => buscar("treino", URL_TREINO, (r) => r.text());

/** Texto normalizado de Memorial de Aires (nunca visto pelo modelo). */
export const textoTeste = () => buscar("teste", URL_TESTE, (r) => r.text());

/** Frases originais de Memorial de Aires: { fonte, frases: [{ original, normalizado }] }. */
export const trechos = () => buscar("trechos", URL_TRECHOS, (r) => r.json());
