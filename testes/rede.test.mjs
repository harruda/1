// node testes/rede.test.mjs [pesos.bin] [verificacao.json]
// Confere a rede em JS contra as probabilidades calculadas pelo PyTorch.
import fs from "fs";
import assert from "assert/strict";
import { Rede, decodificarPesos } from "../assets/nucleo/rede.js";
import { codificar } from "../assets/nucleo/alfabeto.js";

const bin = process.argv[2] ?? new URL("../dados/machadinho-pesos.txt", import.meta.url);
const ver = JSON.parse(fs.readFileSync(process.argv[3] ?? new URL("../dados/machadinho-verificacao.json", import.meta.url), "utf8"));
const rede = new Rede(decodificarPesos(fs.readFileSync(bin, "utf8")));
console.log("parâmetros:", rede.parametros);
const cod = codificar(ver.frase);
const s = rede.sessao();
let maxErro = 0, p;
for (let i = 0; i < cod.length; i++) {
  p = s.alimentar(cod[i]);
  if (i < cod.length - 1) maxErro = Math.max(maxErro, Math.abs(Math.log(p[cod[i + 1]]) - ver.logprob_proximo[i]));
}
for (let k = 0; k < p.length; k++) maxErro = Math.max(maxErro, Math.abs(p[k] - ver.distribuicao_final[k]));
console.log("maior diferença:", maxErro);
assert.ok(maxErro < 2e-3, "a rede em JS diverge do PyTorch");
let t0 = performance.now();
const sup = rede.surpresas(codificar("a vida é assim mesmo uma coisa depois da outra e nada mais"));
console.log("surpresa média:", (sup.reduce((a, b) => a + b) / sup.length).toFixed(3), "bits;", ((performance.now() - t0) / sup.length).toFixed(2), "ms/letra");
// janela deslizante não quebra
const longo = codificar("era uma vez ".repeat(30));
const s2 = rede.surpresas(longo);
assert.ok(s2.every(Number.isFinite));
console.log("rede.test: ok");
