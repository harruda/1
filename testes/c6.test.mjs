// node testes/c6.test.mjs — lógica pura do capítulo 6
import assert from "assert/strict";
import * as C from "../capitulos/c6.js";
import { codificar, decodificar } from "../assets/nucleo/alfabeto.js";
import { criarRng, capacidadeBSC, informacaoMutua, entropiaBinaria, hammingSindrome } from "../assets/nucleo/info.js";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// código fixo de 6 bits: ida e volta
const frase = "cuidei que não acabaria de me habituar";
const bits = C.bitsDeSimbolos(codificar(frase));
assert.equal(bits.length, 6 * frase.length);
assert.deepEqual(C.bitsDeSimbolos([22]), [0, 1, 0, 1, 1, 0]); // "v"
assert.equal(decodificar(C.simbolosDeBits(bits)), frase);

// ruído fixo: p = 0 não troca nada, p = 1 troca tudo, e aumentar p só acrescenta trocas
const u = C.sortearRuido(bits.length, criarRng(5));
assert.deepEqual(C.aplicarRuido(bits, u, 0), bits);
assert.ok(C.aplicarRuido(bits, u, 1).every((b, i) => b !== bits[i]));
const r1 = C.aplicarRuido(bits, u, 0.05), r2 = C.aplicarRuido(bits, u, 0.1);
for (let i = 0; i < bits.length; i++) if (r1[i] !== bits[i]) assert.notEqual(r2[i], bits[i]);

// binomial e repetição
assert.equal(C.binomial(5, 2), 10);
assert.equal(C.binomial(25, 13), 5200300);
perto(C.erroRepeticao(1, 0.1), 0.1);
perto(C.erroRepeticao(3, 0.1), 3 * 0.01 * 0.9 + 0.001);
perto(C.erroRepeticao(5, 0.1), 0.00856);
perto(C.erroRepeticao(7, 0.5), 0.5);
// simulação confere com a fórmula
{
  const rng = criarRng(1);
  let erros = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    let t = 0;
    for (let j = 0; j < 3; j++) if (rng() < 0.1) t++;
    if (t >= 2) erros++;
  }
  perto(erros / N, 0.028, 0.002);
}

// Hamming em fluxo: sem ruído, ida e volta; um erro por bloco é corrigido
{
  const cod = C.hammingCodificarBits(bits);
  assert.equal(cod.length, (Math.ceil(bits.length / 4) * 7));
  assert.deepEqual(C.hammingDecodificarBits(cod, bits.length), bits);
  const ruim = cod.slice();
  for (let b = 0; b < ruim.length / 7; b++) ruim[7 * b + (b % 7)] ^= 1;
  assert.deepEqual(C.hammingDecodificarBits(ruim, bits.length), bits);
  // completa com zeros quando não é múltiplo de 4
  assert.deepEqual(C.hammingDecodificarBits(C.hammingCodificarBits([1, 0, 1, 1, 1]), 5), [1, 0, 1, 1, 1]);
}

// palavras de Hamming: 16, todas com síndrome zero, distância mínima 3, código perfeito
{
  const P = C.palavrasHamming();
  assert.equal(new Set(P.map((p) => p.join(""))).size, 16);
  for (const p of P) assert.equal(hammingSindrome(p), 0);
  assert.equal(C.distanciaMinima(P), 3);
  const cobertas = new Set();
  for (const p of P) {
    cobertas.add(p.join(""));
    for (let i = 0; i < 7; i++) {
      const q = p.slice();
      q[i] ^= 1;
      cobertas.add(q.join(""));
    }
  }
  assert.equal(cobertas.size, 128);
  assert.equal(C.distancia([0, 1, 1, 0, 0, 1, 1], [0, 1, 1, 0, 1, 1, 1]), 1);
}

// erro por bit do Hamming(7,4): 0 em p = 0 e ≈ 9p² para p pequeno
perto(C.erroBitHamming(0), 0);
assert.ok(Math.abs(C.erroBitHamming(0.001) / 9e-6 - 1) < 0.02);
perto(C.erroBitHamming(0.1), 0.06688, 1e-4);

// contagem de bits
assert.equal(C.contarUns(0), 0);
assert.equal(C.contarUns(0b1011), 3);
assert.equal(C.contarUns(0xffffffff), 32);

// códigos aleatórios: sem ruído nunca erra (salvo palavras repetidas); com p = 1/2, erra quase sempre
{
  const rng = criarRng(3);
  const cod = Uint32Array.from([0b0000000000, 0b1111100000, 0b0000011111, 0b1111111111]);
  for (let i = 0; i < 200; i++) assert.equal(C.envioAleatorio(cod, 10, 0, rng), false);
  let erros = 0;
  const grande = C.codigoAleatorio(12, 64, rng);
  assert.ok(grande.every((x) => x < 4096));
  for (let i = 0; i < 2000; i++) erros += C.envioAleatorio(grande, 12, 0.5, rng);
  assert.ok(erros / 2000 > 0.9);
}

// informação mútua do canal binário simétrico: máximo em q = 1/2 vale 1 − h(p)
for (const p of [0, 0.05, 0.1, 0.3, 0.5, 0.9]) {
  const conj = C.conjuntaBSC(0.5, p);
  perto(informacaoMutua(conj), capacidadeBSC(p), 1e-9);
  perto(1 - C.entropiaCondicionalXY(conj), capacidadeBSC(p), 1e-9);
  for (const q of [0.1, 0.3, 0.7]) assert.ok(informacaoMutua(C.conjuntaBSC(q, p)) <= capacidadeBSC(p) + 1e-12);
}
perto(C.entropiaCondicionalXY(C.conjuntaBSC(0.5, 0.1)), entropiaBinaria(0.1));

// formatação de probabilidades
assert.equal(C.fmtProb(0), "0");
assert.equal(C.fmtProb(0.028), "2,80%");
assert.equal(C.fmtProb(0.000298), "3,0 × 10⁻⁴");
assert.equal(C.fmtProb(9.99e-5), "1,0 × 10⁻⁴");
assert.equal(C.fmtProb(1.6e-7), "1,6 × 10⁻⁷");

console.log("c6.test: tudo certo");
