// node testes/c5.test.mjs — lógica pura do capítulo 5 (códigos, Kraft, Huffman em blocos, aritmética exata).
import assert from "assert/strict";
import * as C from "../capitulos/c5.js";
import * as I from "../assets/nucleo/info.js";

const perto = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const prefixoLivre = (cs) => {
  for (const a of cs) for (const b of cs) if (a !== b) assert.ok(!b.startsWith(a), `${a} é prefixo de ${b}`);
};

// ---------- código canônico e Kraft ----------
{
  const { codigos, soma } = C.codigoCanonico([2, 3, 2, 3, 3, 4, 4]);
  perto(soma, 1);
  assert.deepEqual(codigos.map((c) => c.length), [2, 3, 2, 3, 3, 4, 4]);
  prefixoLivre(codigos);
  assert.deepEqual(codigos, ["00", "100", "01", "101", "110", "1110", "1111"]);
}
{
  // folga: 2,2,3,3,3 soma 7/8
  const { codigos, soma } = C.codigoCanonico([2, 2, 3, 3, 3]);
  perto(soma, 0.875);
  assert.deepEqual(codigos, ["00", "01", "100", "101", "110"]);
}
{
  // estouro: 1,1,2 → o terceiro fica sem lugar
  const { codigos, soma } = C.codigoCanonico([1, 1, 2]);
  perto(soma, 1.25);
  assert.deepEqual(codigos, ["0", "1", null]);
}
// muitos casos aleatórios: soma ≤ 1 ⇔ todo mundo cabe
{
  const rng = I.criarRng(3);
  for (let t = 0; t < 2000; t++) {
    const n = 2 + Math.floor(rng() * 7);
    const comps = Array.from({ length: n }, () => 1 + Math.floor(rng() * 7));
    const { codigos, soma } = C.codigoCanonico(comps);
    const todos = codigos.every((c) => c !== null);
    assert.equal(todos, soma <= 1 + 1e-12, `comps ${comps}`);
    const ok = codigos.filter(Boolean);
    prefixoLivre(ok);
    codigos.forEach((c, i) => c && assert.equal(c.length, comps[i]));
  }
}

// ---------- árvore de códigos ----------
{
  const a = C.arvoreDeCodigos([{ simbolo: "e", codigo: "0" }, { simbolo: "a", codigo: "10" }]);
  const livres = a.nos.filter((n) => n.tipo === "livre").map((n) => n.prefixo);
  assert.deepEqual(livres, ["11"]);
  assert.equal(a.folhas, 3);
  assert.equal(a.profMax, 2);
  assert.equal(a.raiz.tipo, "interno");
  const vazia = C.arvoreDeCodigos([]);
  assert.equal(vazia.raiz.tipo, "livre");
}

// ---------- posições do dendrograma de Huffman ----------
{
  const it = [["a", 45], ["b", 13], ["c", 12], ["d", 16], ["e", 9], ["f", 5]].map(([simbolo, peso]) => ({ simbolo, peso }));
  const { raiz } = I.huffman(it);
  const { pos, folhas, alturaMax } = C.posicoesHuffman(raiz);
  assert.equal(folhas, 6);
  assert.equal(alturaMax, 4);
  // cada nó interno fica entre os filhos e acima deles
  (function checar(no) {
    if (no.folha) return;
    const p = pos.get(no.id), a = pos.get(no.zero.id), b = pos.get(no.um.id);
    assert.ok(p.altura > a.altura && p.altura > b.altura);
    assert.ok(Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x));
    checar(no.zero);
    checar(no.um);
  })(raiz);
}

// ---------- Huffman em blocos (moeda viciada) ----------
perto(C.huffmanBlocos(0.1, 1), 1);
perto(C.huffmanBlocos(0.1, 2), 0.645);
perto(C.huffmanBlocos(0.5, 3), 1);
for (const p of [0.02, 0.1, 0.25, 0.4]) {
  const H = I.entropiaBinaria(p);
  for (let k = 1; k <= 8; k++) {
    const L = C.huffmanBlocos(p, k);
    assert.ok(H - 1e-12 <= L && L < H + 1 / k, `p=${p} k=${k} L=${L}`);
  }
}

// ---------- quantização ----------
{
  const rng = I.criarRng(9);
  for (let t = 0; t < 200; t++) {
    const p = I.normalizarProb(Array.from({ length: 39 }, () => rng() ** 6));
    const f = C.quantizar(p, 65536);
    assert.equal(f.reduce((a, b) => a + b, 0), 65536);
    assert.ok(f.every((x) => x >= 1));
  }
  const u = C.quantizar(new Array(39).fill(1 / 39), 65536);
  assert.equal(u.reduce((a, b) => a + b, 0), 65536);
}

// ---------- mensagem do intervalo ----------
{
  // [1/4, 5/16) em escala 2^4: L = 4, R = 1 → "0100"
  assert.equal(C.mensagemDoIntervalo(4n, 1n, 4), "0100");
  // [0,1): mensagem vazia
  assert.equal(C.mensagemDoIntervalo(0n, 1n, 0), "");
  // confere com bitsDoIntervalo (ponto flutuante) em intervalos pequenos
  const rng = I.criarRng(11);
  for (let t = 0; t < 500; t++) {
    const E = 20;
    const R = 1 + Math.floor(rng() * 4000);
    const L = Math.floor(rng() * (2 ** E - R));
    const a = C.mensagemDoIntervalo(BigInt(L), BigInt(R), E);
    const b = I.bitsDoIntervalo(L / 2 ** E, (L + R) / 2 ** E);
    assert.equal(a, b, `L=${L} R=${R}`);
  }
}
{
  assert.equal(C.prefixoComum(0b0110n, 2n, 4), "011"); // [0110, 0111]
  assert.equal(C.prefixoComum(0n, 16n, 4), "");
}

// ---------- aritmética: ida e volta, e custo ≈ soma das surpresas ----------
{
  const B = 16, T = 2 ** B;
  // um "modelo" de brinquedo que depende do contexto: favorece repetir o símbolo anterior
  const dist = (hist, i) => {
    const p = new Array(39).fill(0.5 / 38);
    p[i > 0 ? hist[i - 1] : 0] = 0.5;
    return C.quantizar(p, T);
  };
  const rng = I.criarRng(21);
  for (let t = 0; t < 60; t++) {
    const n = Math.floor(rng() * 120);
    const msg = [];
    for (let i = 0; i < n; i++) msg.push(rng() < 0.6 && i ? msg[i - 1] : Math.floor(rng() * 39));
    const r = C.codificarAritmetico(msg, dist, B);
    const volta = C.decodificarAritmetico(r.bits, n, dist, B);
    assert.deepEqual(volta, msg);
    assert.ok(r.bits.length <= Math.ceil(r.custo) + 2, `bits ${r.bits.length} custo ${r.custo}`);
    assert.ok(r.bits.length >= Math.floor(r.custo), `bits ${r.bits.length} custo ${r.custo}`);
    // bits decididos são prefixo da mensagem e só crescem
    let ant = 0;
    for (const p of r.passos) {
      assert.ok(p.decididos >= ant);
      ant = p.decididos;
    }
    assert.ok(r.bits.startsWith(r.decididos));
  }
  // exemplo do texto: a=1/2, b=1/4, c=1/4 (B=2): "aba" → [1/4, 5/16) → 0100
  const f = () => Uint32Array.from([2, 1, 1]);
  const r = C.codificarAritmetico([0, 1, 0], f, 2);
  assert.equal(r.bits, "0100");
  perto(r.custo, 4);
  assert.deepEqual(C.decodificarAritmetico("0100", 3, f, 2), [0, 1, 0]);
  // decodificar com bits trocados nunca quebra: sempre devolve n símbolos válidos
  const msg = [3, 3, 3, 7, 7, 1, 0, 0, 0, 12];
  const rr = C.codificarAritmetico(msg, dist, B);
  for (let i = 0; i < rr.bits.length; i++) {
    const b = rr.bits.slice(0, i) + (rr.bits[i] === "0" ? "1" : "0") + rr.bits.slice(i + 1);
    const out = C.decodificarAritmetico(b, msg.length, dist, B);
    assert.equal(out.length, msg.length);
    assert.ok(out.every((x) => x >= 0 && x < 39));
  }
}

console.log("c5: todos os testes passaram");
