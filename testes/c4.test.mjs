// node testes/c4.test.mjs — lógica pura do capítulo 4 (modelo de palavras, letras apagadas,
// restauração, contagem de contextos). Treina o modelo de ordem 5 (alguns segundos).
import fs from "fs";
import assert from "assert/strict";
import { codificar, normalizar, K } from "../assets/nucleo/alfabeto.js";
import { contar, ModeloNgramas } from "../assets/nucleo/ngramas.js";
import { criarRng } from "../assets/nucleo/info.js";
import {
  construirPalavrasJa,
  gerarPalavras,
  prefixoNormalizado,
  mascaraApagadas,
  restaurar,
  contarContextos,
  fracaoInedita,
  surpresaPorPosicao,
} from "../capitulos/c4.js";

let ok = 0;
const teste = (nome, f) => {
  f();
  ok++;
  console.log("ok -", nome);
};

// ---------- modelo de palavras ----------
const mini = "o gato viu o rato e o rato viu o gato";
const mp = construirPalavrasJa(mini);
teste("palavras: vocabulário e índice de ocorrências", () => {
  assert.equal(mp.n, 11);
  assert.deepEqual(mp.vocab, ["o", "gato", "viu", "rato", "e"]);
  // "o" aparece nas posições 0, 3, 6, 9 (a última palavra, "gato", não entra: não tem seguinte)
  const o = mp.idDe.get("o");
  assert.deepEqual([...mp.pos.slice(mp.inicio[o], mp.inicio[o + 1])], [0, 3, 6, 9]);
  assert.equal(mp.inicio[mp.vocab.length], mp.n - 1);
});
teste("palavras: bigrama só produz pares que existem no texto", () => {
  const pares = new Set();
  const t = mini.split(" ");
  for (let i = 0; i + 1 < t.length; i++) pares.add(t[i] + " " + t[i + 1]);
  const g = gerarPalavras(mp, 2, 200, criarRng(3), ["o"]);
  let ant = "o";
  for (const w of g) {
    if (mp.inicio[mp.idDe.get(ant) + 1] > mp.inicio[mp.idDe.get(ant)]) assert.ok(pares.has(ant + " " + w), `${ant} ${w}`);
    ant = w;
  }
});
teste("palavras: unigrama segue as frequências", () => {
  const g = gerarPalavras(mp, 1, 20000, criarRng(5));
  const fo = g.filter((w) => w === "o").length / g.length; // 4/11
  assert.ok(Math.abs(fo - 4 / 11) < 0.02, String(fo));
});
teste("palavras: mesma semente, mesmo texto", () => {
  assert.deepEqual(gerarPalavras(mp, 2, 30, criarRng(9)), gerarPalavras(mp, 2, 30, criarRng(9)));
});
teste("prefixo: normaliza e preserva o fim de palavra", () => {
  assert.equal(prefixoNormalizado("Capitu"), "capitu");
  assert.equal(prefixoNormalizado("Capitu, "), "capitu ");
  assert.equal(prefixoNormalizado("   "), "");
});

// ---------- letras apagadas ----------
const frase = normalizar("Rita não tem cultura, mas tem finura, e naquela ocasião tinha principalmente fome.");
teste("máscara: nunca apaga espaços e respeita a fração", () => {
  const m = mascaraApagadas(frase, 0.5, "acaso", 1);
  const letras = [...frase].filter((c) => c !== " ").length;
  let n = 0;
  for (let i = 0; i < frase.length; i++) if (m[i]) {
    n++;
    assert.notEqual(frase[i], " ");
  }
  assert.equal(n, Math.round(0.5 * letras));
});
teste("máscara: aumentar a fração só acrescenta buracos", () => {
  const a = mascaraApagadas(frase, 0.3, "acaso", 4), b = mascaraApagadas(frase, 0.6, "acaso", 4);
  for (let i = 0; i < frase.length; i++) if (a[i]) assert.equal(b[i], 1);
});
teste("máscara: modo vogais só apaga vogais", () => {
  const m = mascaraApagadas(frase, 1, "vogais", 2);
  for (let i = 0; i < frase.length; i++) assert.equal(m[i], "aeiouáàâãéêíóôõú".includes(frase[i]) ? 1 : 0);
});

// ---------- com o modelo de Machado ----------
const treino = codificar(fs.readFileSync(new URL("../dados/machado-treino.txt", import.meta.url), "utf8"));
const testeTxt = fs.readFileSync(new URL("../dados/machado-teste.txt", import.meta.url), "utf8");
const M = new ModeloNgramas(contar(treino, 5));

teste("restaurar: sem buracos, devolve o texto", () => {
  const cod = codificar(frase);
  assert.deepEqual([...restaurar(M, cod, new Uint8Array(cod.length))], [...cod]);
});
teste("restaurar: dois lados acerta mais que só um, e acerta muito com 30% apagado", () => {
  const frases = JSON.parse(fs.readFileSync(new URL("../dados/trechos.json", import.meta.url), "utf8")).frases.slice(0, 40);
  let n = 0, esq = 0, dois = 0;
  for (const [k, f] of frases.entries()) {
    const cod = codificar(f.normalizado);
    const m = mascaraApagadas(f.normalizado, 0.3, "acaso", k + 1);
    const a = restaurar(M, cod, m, { ambos: false }), b = restaurar(M, cod, m, { ambos: true });
    for (let i = 0; i < cod.length; i++) if (m[i]) {
      n++;
      esq += a[i] === cod[i];
      dois += b[i] === cod[i];
    }
  }
  console.log(`   30% ao acaso, 40 frases: só à esquerda ${(100 * esq / n).toFixed(1)}%, dois lados ${(100 * dois / n).toFixed(1)}% de ${n} letras`);
  assert.ok(dois > esq);
  assert.ok(dois / n > 0.6);
});
teste("restaurar: candidatos restringem a escolha", () => {
  const cod = codificar(frase);
  const m = mascaraApagadas(frase, 1, "vogais", 3);
  const vog = [..."aeiouáàâãéêíóôõú"].map((c) => codificar(c)[0]);
  const r = restaurar(M, cod, m, { candidatos: vog });
  for (let i = 0; i < cod.length; i++) if (m[i]) assert.ok(vog.includes(r[i]));
});
teste("contextos: contagens batem com o modelo e crescem", () => {
  const l = contarContextos(M);
  assert.equal(l.length, 6);
  assert.equal(l[0].vistos, K);
  assert.equal(l[0].possiveis, 39);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].vistos > l[i - 1].vistos && l[i].vistos < l[i].possiveis);
  console.log("   vistos:", l.map((x) => x.vistos).join(" "), " uma vez:", l.map((x) => x.unicos).join(" "));
});
teste("contextos inéditos: zero no próprio treino, crescendo com N no teste", () => {
  const tr = treino.slice(0, 20000);
  for (let N = 1; N <= 6; N++) assert.equal(fracaoInedita(M, tr, N), 0);
  const cod = codificar(testeTxt.slice(0, 30000));
  const f = [1, 2, 3, 4, 5, 6].map((N) => fracaoInedita(M, cod, N));
  console.log("   inéditos no teste:", f.map((x) => (100 * x).toFixed(2) + "%").join(" "));
  for (let i = 1; i < f.length; i++) assert.ok(f[i] >= f[i - 1]);
});
teste("surpresa por posição: médias consistentes", () => {
  const t = normalizar("Ora, eu creio que um velho túmulo dá melhor impressão do oficio, se tem as negruras do tempo, que tudo consome.");
  const cod = codificar(t);
  const r5 = surpresaPorPosicao(t, M.surpresas(cod, 5));
  const r0 = surpresaPorPosicao(t, M.surpresas(cod, 0));
  console.log(`   ordem 0: início ${r0.inicio.toFixed(2)}, meio ${r0.meio.toFixed(2)}; ordem 5: início ${r5.inicio.toFixed(2)}, meio ${r5.meio.toFixed(2)}, espaço ${r5.espaco.toFixed(2)}`);
  assert.ok(r5.inicio > r5.meio * 1.5);
});
console.log(`\n${ok} testes passaram`);
