// node testes/c2.test.mjs
import assert from "assert/strict";
import * as C from "../capitulos/c2.js";
import { baudot } from "../assets/nucleo/ui.js";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// perguntas necessárias = ⌈log₂ N⌉, sem erro de ponto flutuante nas potências de 2
assert.equal(C.perguntasNecessarias(1), 0);
assert.equal(C.perguntasNecessarias(2), 1);
assert.equal(C.perguntasNecessarias(8), 3);
assert.equal(C.perguntasNecessarias(9), 4);
assert.equal(C.perguntasNecessarias(100), 7);
assert.equal(C.perguntasNecessarias(1000), 10);
assert.equal(C.perguntasNecessarias(1000000), 20);
assert.equal(C.perguntasNecessarias(2 ** 20), 20);
assert.equal(C.perguntasNecessarias(2 ** 20 + 1), 21);

// busca binária: acha qualquer número, nunca passa de ⌈log₂ N⌉, e a soma dos bits é log₂ N
for (const N of [2, 3, 7, 8, 100, 1000]) {
  const k = C.perguntasNecessarias(N);
  for (let x = 1; x <= N; x++) {
    let lo = 1, hi = N, q = 0, soma = 0;
    while (lo < hi) {
      const m = C.corteAoMeio(lo, hi);
      assert.ok(m >= lo && m < hi);
      const r = C.aplicarResposta(lo, hi, m, x > m);
      ({ lo, hi } = r);
      soma += r.bits;
      q++;
    }
    assert.equal(lo, x);
    assert.ok(q <= k, `N=${N} x=${x}: ${q} > ${k}`);
    perto(soma, Math.log2(N), 1e-9);
  }
}
// com N potência de 2, as respostas são x − 1 em binário
for (let x = 1; x <= 8; x++) assert.equal(C.respostasBinarias(x, 8).join(""), (x - 1).toString(2).padStart(3, "0"));
assert.equal(C.respostasBinarias(6, 8).join(""), "101");

// estratégia ruim (corte a 1/4) também soma log₂ N, mas pode precisar de mais perguntas
{
  let lo = 1, hi = 1000, soma = 0, q = 0;
  const x = 999;
  while (lo < hi) {
    const m = lo + Math.max(0, Math.floor((hi - lo + 1) / 4) - 1);
    const r = C.aplicarResposta(lo, hi, m, x > m);
    ({ lo, hi } = r);
    soma += r.bits;
    q++;
  }
  assert.equal(lo, x);
  perto(soma, Math.log2(1000), 1e-9);
  assert.ok(q > 10);
}

// valores citados no texto
perto(C.aplicarResposta(1, 1000, 900, true).bits, Math.log2(10));
perto(C.aplicarResposta(1, 1000, 900, false).bits, Math.log2(10 / 9));

// unidades
perto(C.converter(Math.log2(10), "hartley"), 1);
perto(C.converter(Math.log2(Math.E), "nat"), 1);
perto(C.converter(3, "bit"), 3);
perto(C.converter(6 * Math.log2(10), "hartley"), 6);

// Morse
assert.equal(C.duracaoMorse(C.MORSE.e), 1);
assert.equal(C.duracaoMorse(C.MORSE.t), 3);
assert.equal(C.duracaoMorse(C.MORSE.a), 5);
assert.equal(C.duracaoMorse(C.MORSE.o), 11);
assert.equal(C.duracaoMorse(C.MORSE.q), 13);
assert.equal(Object.keys(C.MORSE).length, 26);
// Morse é unívoco letra a letra
assert.equal(new Set(Object.values(C.MORSE)).size, 26);

// ITA2: 26 letras + 6 comandos = as 32 combinações, sem repetição
const todos = [...Object.values(C.ITA2_LETRAS), ...Object.keys(C.ITA2_COMANDOS)];
assert.equal(todos.length, 32);
assert.equal(new Set(todos).size, 32);
// a mesma tabela que desenha a fita do topo dos capítulos
const titulo = "Perguntas de sim ou não";
assert.deepEqual(C.ita2(titulo).map((c) => c.cod), baudot(titulo));
// mudanças de registro
const f = C.ita2("ab 19 c");
assert.deepEqual(f.map((c) => c.rotulo), ["a", "b", "␣", "ALG", "1", "9", "␣", "LET", "c"]);
assert.equal(f[3].cod, C.ALGARISMOS);
assert.equal(f[4].cod, C.ITA2_LETRAS.q);
assert.equal(f[5].cod, C.ITA2_LETRAS.o);
assert.equal(f[7].cod, C.LETRAS);
assert.deepEqual(C.ita2("çã!").map((c) => c.rotulo), ["c", "a"]);

// arranjos: melhor ≤ real ≤ pior; acaso é a média simples
{
  const freqs = { a: 10, b: 1, c: 5 };
  const custos = { a: 3, b: 1, c: 2 };
  const r = C.arranjos(freqs, custos);
  perto(r.real, (10 * 3 + 1 * 1 + 5 * 2) / 16);
  perto(r.melhor, (10 * 1 + 5 * 2 + 1 * 3) / 16);
  perto(r.pior, (10 * 3 + 5 * 2 + 1 * 1) / 16);
  perto(r.acaso, 2);
}

console.log("c2: ok");
