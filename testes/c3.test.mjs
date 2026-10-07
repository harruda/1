// node testes/c3.test.mjs — lógica pura do capítulo 3 (e as contas de Machado citadas no texto).
import assert from "assert/strict";
import fs from "fs";
import { redistribuir, parcela, perguntasMedias, MEDIDAS, agrupar, entropiaContagens, estatisticasPares } from "../capitulos/c3.js";
import { codificar, ALFABETO, K } from "../assets/nucleo/alfabeto.js";
import { entropia } from "../assets/nucleo/info.js";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const soma = (v) => v.reduce((a, b) => a + b, 0);

// redistribuir: fixa um valor e mantém a soma 1 e as proporções dos outros
let p = redistribuir([0.5, 0.25, 0.25], 0, 0.8);
perto(soma(p), 1);
perto(p[0], 0.8);
perto(p[1], p[2]);
p = redistribuir([1, 0, 0, 0], 0, 0.4); // os outros eram zero: dividem o resto igualmente
perto(p[1], 0.2);
perto(soma(p), 1);
p = redistribuir([0.2, 0.3, 0.5], 2, 1.7); // valor fora do intervalo é limitado a 1
perto(p[2], 1);
perto(p[0] + p[1], 0);

// parcela
perto(parcela(0), 0);
perto(parcela(0.5), 0.5);
perto(parcela(0.25), 0.5);

// perguntas: igual à entropia para distribuições diádicas; entre H e H+1 nas outras
perto(perguntasMedias([0.5, 0.25, 0.125, 0.125]), 1.75);
perto(perguntasMedias([1, 0, 0]), 0);
perto(perguntasMedias([0.5, 0.5]), 1);
for (const d of [[0.9, 0.1], [0.1, 0.1, 0.1, 0.1, 0.1, 0.5], [0.97, 0.01, 0.01, 0.01], Array(6).fill(1 / 6)]) {
  const L = perguntasMedias(d), H = entropia(d);
  assert.ok(H <= L + 1e-12 && L < H + 1, `${H} ≤ ${L} < H+1`);
}
perto(perguntasMedias([0.1, 0.1, 0.1, 0.1, 0.1, 0.5]), 2.2);

// agrupamento: o exemplo de Shannon e uma grade de valores
const ex = agrupar(MEDIDAS.shannon.f, 1 / 2, 2 / 3);
perto(ex.umaEtapa, entropia([1 / 2, 1 / 3, 1 / 6]));
perto(ex.umaEtapa, 1.4591479170272448, 1e-12);
perto(ex.duasEtapas, ex.umaEtapa);
for (let a = 1; a < 20; a++)
  for (let b = 0; b <= 20; b++) {
    const r = agrupar(MEDIDAS.shannon.f, a / 20, b / 20);
    perto(r.umaEtapa, r.duasEtapas, 1e-12);
    perto(soma(r.p), 1);
  }
// as alternativas falham no exemplo de Shannon
assert.ok(Math.abs(agrupar(MEDIDAS.gini.f, 0.5, 2 / 3).umaEtapa - agrupar(MEDIDAS.gini.f, 0.5, 2 / 3).duasEtapas) > 0.1);
assert.ok(Math.abs(agrupar(MEDIDAS.hartley.f, 0.5, 2 / 3).umaEtapa - agrupar(MEDIDAS.hartley.f, 0.5, 2 / 3).duasEtapas) > 0.05);

// entropia de contagens
perto(entropiaContagens([5, 5]), 1);
perto(entropiaContagens([0, 0]), 0);
perto(entropiaContagens([3, 1]), entropia([0.75, 0.25]));

// estatísticas de pares: a regra da cadeia vale exatamente
const pares = [[10, 0, 5], [2, 2, 2], [0, 7, 1]];
const e = estatisticasPares(pares);
perto(e.HX + e.HYdX, e.HXY, 1e-12);
assert.ok(e.HYdX <= e.HY + 1e-12);
// independência: H(X,Y) = H(X) + H(Y)
const ind = estatisticasPares([[4, 2], [2, 1]]);
perto(ind.HXY, ind.HX + ind.HY, 1e-12);

// números de Machado citados no texto
const cod = codificar(fs.readFileSync(new URL("../dados/machado-treino.txt", import.meta.url), "utf8"));
const freq = new Array(K).fill(0);
for (const c of cod) freq[c]++;
const mat = ALFABETO.split("").map(() => new Array(K).fill(0));
for (let i = 0; i + 1 < cod.length; i++) mat[cod[i]][cod[i + 1]]++;
const M = estatisticasPares(mat);
const H1 = entropiaContagens(freq);
const q = ALFABETO.indexOf("q"), u = ALFABETO.indexOf("u"), esp = 0;
assert.equal(freq[q], 28198);
assert.equal(mat[q][u], 28197);
assert.equal(Math.round(H1 * 100), 410);
assert.equal(Math.round(M.HXY * 100), 732);
assert.equal(Math.round(M.HYdX * 100), 322);
assert.equal(Math.round(M.linhas[esp].H * 100), 415);
assert.ok(M.linhas[q].H < 0.01);
assert.equal(freq[ALFABETO.indexOf("w")], 109);
console.log(`H1 = ${H1.toFixed(4)}, H(X,Y) = ${M.HXY.toFixed(4)}, H(Y|X) = ${M.HYdX.toFixed(4)}`);
console.log("c3: ok");
