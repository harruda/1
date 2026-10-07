// node testes/ngramas.test.mjs — treina o modelo e mede entropia cruzada no Memorial de Aires.
import fs from "fs";
import { codificar, K } from "../assets/nucleo/alfabeto.js";
import { contar, ModeloNgramas } from "../assets/nucleo/ngramas.js";

const ORD = +(process.argv[2] ?? 6);
const treino = codificar(fs.readFileSync(new URL("../dados/machado-treino.txt", import.meta.url), "utf8"));
const teste = codificar(fs.readFileSync(new URL("../dados/machado-teste.txt", import.meta.url), "utf8")).slice(0, 60000);
let t0 = performance.now();
const m = new ModeloNgramas(contar(treino, ORD));
console.log(`treino: ${treino.length} chars, ordem ${ORD}, ${(performance.now() - t0) | 0} ms`);
console.log("tamanhos:", m.pares.map((t) => t.n).join(" "));

// distribuição soma 1
const d = m.distribuicao(teste.slice(0, 50), ORD);
const soma = d.reduce((a, b) => a + b, 0);
if (Math.abs(soma - 1) > 1e-9) throw new Error("distribuição não soma 1: " + soma);
// prob coincide com distribuicao
for (let i = 10; i < 20; i++) {
  const a = m.prob(teste, teste[i], ORD, i), b = m.distribuicao(teste, ORD, i)[teste[i]];
  if (Math.abs(a - b) > 1e-12) throw new Error("prob != distribuicao");
}
for (const D of [0.6, 0.7, 0.8, 0.9]) {
  m.d = D;
  const linha = [];
  for (let o = -1; o <= ORD; o++) linha.push(m.entropiaCruzada(teste, o).toFixed(3));
  console.log("D=" + D, linha.join("  "));
}
console.log("log2 K =", Math.log2(K).toFixed(3));
