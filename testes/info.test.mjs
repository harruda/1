// node testes/info.test.mjs
import assert from "assert/strict";
import * as I from "../assets/nucleo/info.js";
import { alinhar, normalizar } from "../assets/nucleo/alfabeto.js";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

perto(I.entropia([0.5, 0.5]), 1);
perto(I.entropia([0.25, 0.25, 0.25, 0.25]), 2);
perto(I.entropia([1, 0]), 0);
perto(I.entropiaBinaria(0.11), 0.4999162, 1e-6);
perto(I.surpresa(1 / 8), 3);
perto(I.divergenciaKL([0.5, 0.5], [0.5, 0.5]), 0);
perto(I.entropiaCruzada([0.5, 0.5], [0.25, 0.75]), I.entropia([0.5, 0.5]) + I.divergenciaKL([0.5, 0.5], [0.25, 0.75]));

// Huffman: exemplo clássico
const it = [["a", 45], ["b", 13], ["c", 12], ["d", 16], ["e", 9], ["f", 5]].map(([simbolo, peso]) => ({ simbolo, peso }));
const { codigos, passos } = I.huffman(it);
assert.equal(passos.length, 5);
const probs = new Map(it.map((x) => [x.simbolo, x.peso / 100]));
perto(I.comprimentoMedio(codigos, probs), 2.24);
perto(I.somaKraft([...codigos.values()].map((c) => c.length)), 1);
// prefixo-livre
const cs = [...codigos.values()];
for (const a of cs) for (const b of cs) if (a !== b) assert.ok(!b.startsWith(a));
// H ≤ L < H + 1
const H = I.entropia([...probs.values()]);
assert.ok(H <= 2.24 && 2.24 < H + 1);

// Aritmética: intervalo final tem largura = produto das probabilidades
const p = [0.6, 0.3, 0.1];
const ints = I.intervalosAritmeticos([0, 1, 0, 2], () => p);
const f = ints.at(-1);
perto(f.alto - f.baixo, 0.6 * 0.3 * 0.6 * 0.1);
const bits = I.bitsDoIntervalo(f.baixo, f.alto);
const v = parseInt(bits, 2) / 2 ** bits.length;
assert.ok(v >= f.baixo && v + 2 ** -bits.length <= f.alto);
assert.ok(bits.length <= Math.ceil(-Math.log2(f.alto - f.baixo)) + 1);

// Hamming(7,4): corrige qualquer erro único em qualquer palavra
for (let d = 0; d < 16; d++) {
  const dados = [d & 1, (d >> 1) & 1, (d >> 2) & 1, (d >> 3) & 1];
  const c = I.hammingCodificar(dados);
  assert.equal(I.hammingSindrome(c), 0);
  for (let e = 0; e < 7; e++) {
    const r = c.slice();
    r[e] ^= 1;
    const dec = I.hammingDecodificar(r);
    assert.equal(dec.sindrome, e + 1);
    assert.deepEqual(dec.dados, dados);
  }
}

perto(I.capacidadeBSC(0.5), 0);
perto(I.capacidadeBSC(0), 1);
assert.deepEqual(I.maioria(I.repetir([1, 0, 1], 3), 3), [1, 0, 1]);
perto(I.informacaoMutua([[0.5, 0], [0, 0.5]]), 1);
perto(I.informacaoMutua([[0.25, 0.25], [0.25, 0.25]]), 0);

const r1 = I.criarRng(42), r2 = I.criarRng(42);
for (let i = 0; i < 5; i++) assert.equal(r1(), r2());

// alfabeto
assert.equal(normalizar("Não, Capitu!  Olhos de ressaca…"), "não capitu olhos de ressaca");
const a = alinhar("Ei, você.");
assert.equal(a.normalizado, "ei você");
assert.equal(a.mapa[2], 2); // a vírgula vira o espaço
assert.equal(a.mapa[3], -1); // o espaço seguinte é absorvido
assert.equal(a.mapa[8], -1); // ponto final some
console.log("info.test: tudo certo");

// limites de Shannon: se tudo é acertado de primeira, ambos os limites são 0
{
  const r = I.limitesShannon([1, 1, 1, 1]);
  perto(r.superior, 0);
  perto(r.inferior, 0);
  const r2 = I.limitesShannon([1, 2, 1, 2]); // metade no 1º, metade no 2º
  perto(r2.superior, 1);
  perto(r2.inferior, 1); // 2·(0,5 − 0)·log2 2 = 1
  const r3 = I.limitesShannon([1, 1, 1, 3, 2, 1, 5, 1]);
  assert.ok(r3.inferior <= r3.superior);
  console.log("limitesShannon: ok");
}
