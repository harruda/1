// As contas da teoria da informação, num lugar só e testadas (ver testes/info.test.mjs).

export const log2 = Math.log2;

/** Surpresa (autoinformação), em bits, de um evento de probabilidade p. */
export function surpresa(p) {
  return p > 0 ? -Math.log2(p) : Infinity;
}

/** Normaliza um vetor de pesos não negativos para somar 1. */
export function normalizarProb(pesos) {
  const t = pesos.reduce((a, b) => a + b, 0);
  return t > 0 ? pesos.map((x) => x / t) : pesos.map(() => 1 / pesos.length);
}

/** Entropia H(p) = Σ p·log2(1/p), em bits. Termos com p = 0 contribuem 0. */
export function entropia(p) {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/** Entropia binária h(p) de uma moeda que dá cara com probabilidade p. */
export function entropiaBinaria(p) {
  return entropia([p, 1 - p]);
}

/** Entropia cruzada H(p, q) = Σ p·log2(1/q). */
export function entropiaCruzada(p, q) {
  let h = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log2(q[i]);
  return h;
}

/** Divergência de Kullback–Leibler D(p‖q) = H(p,q) − H(p) ≥ 0. */
export function divergenciaKL(p, q) {
  let d = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) d += p[i] * Math.log2(p[i] / q[i]);
  return d;
}

/** Frequências (contagens) dos símbolos de uma sequência: Map símbolo -> contagem. */
export function frequencias(seq) {
  const m = new Map();
  for (const s of seq) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

/** Entropia empírica (bits por símbolo) de uma sequência, contando cada símbolo isolado. */
export function entropiaEmpirica(seq) {
  const f = frequencias(seq);
  const n = [...f.values()].reduce((a, b) => a + b, 0);
  return entropia([...f.values()].map((c) => c / n));
}

/** Soma de Kraft Σ 2^(−ℓ) de uma lista de comprimentos de palavra-código. */
export function somaKraft(comprimentos) {
  return comprimentos.reduce((a, l) => a + 2 ** -l, 0);
}

/**
 * Código de Huffman.
 * Entrada: lista de { simbolo, peso }.
 * Saída: { codigos: Map simbolo -> string de "0"/"1", raiz, passos }
 * `passos` registra cada fusão (para animar a construção):
 *   [{ a, b, novo }] em que a e b são os nós fundidos (os dois de menor peso).
 * Desempates são determinísticos: menor peso, depois o nó criado primeiro.
 */
export function huffman(itens) {
  let id = 0;
  const fila = itens
    .filter((x) => x.peso > 0)
    .map((x) => ({ id: id++, simbolo: x.simbolo, peso: x.peso, folha: true }));
  const passos = [];
  if (fila.length === 0) return { codigos: new Map(), raiz: null, passos };
  if (fila.length === 1) {
    const raiz = fila[0];
    return { codigos: new Map([[raiz.simbolo, "0"]]), raiz, passos };
  }
  const menor = (x, y) => x.peso - y.peso || x.id - y.id;
  while (fila.length > 1) {
    fila.sort(menor);
    const a = fila.shift(), b = fila.shift();
    const novo = { id: id++, peso: a.peso + b.peso, folha: false, zero: a, um: b };
    passos.push({ a, b, novo });
    fila.push(novo);
  }
  const raiz = fila[0];
  const codigos = new Map();
  (function andar(no, pref) {
    if (no.folha) codigos.set(no.simbolo, pref);
    else {
      andar(no.zero, pref + "0");
      andar(no.um, pref + "1");
    }
  })(raiz, "");
  return { codigos, raiz, passos };
}

/** Comprimento médio (bits por símbolo) de um código para uma distribuição Map simbolo -> prob. */
export function comprimentoMedio(codigos, probs) {
  let L = 0;
  for (const [s, p] of probs) L += p * (codigos.get(s)?.length ?? 0);
  return L;
}

/**
 * Codificação aritmética (didática, em ponto flutuante — serve para mostrar os
 * intervalos encolhendo, não para comprimir arquivos longos).
 * `distribuicoes(i)` devolve a distribuição (array de probabilidades) antes do símbolo i.
 * Devolve a lista de intervalos [baixo, alto) após cada símbolo.
 */
export function intervalosAritmeticos(simbolos, distribuicoes) {
  let baixo = 0, alto = 1;
  const out = [{ baixo, alto }];
  for (let i = 0; i < simbolos.length; i++) {
    const p = distribuicoes(i);
    const s = simbolos[i];
    let acum = 0;
    for (let t = 0; t < s; t++) acum += p[t];
    const larg = alto - baixo;
    alto = baixo + larg * (acum + p[s]);
    baixo = baixo + larg * acum;
    out.push({ baixo, alto });
  }
  return out;
}

/**
 * Menor sequência de bits b tal que o intervalo diádico [0.b, 0.b + 2^−|b|)
 * cabe inteiro em [baixo, alto). É a mensagem que a codificação aritmética transmite.
 */
export function bitsDoIntervalo(baixo, alto) {
  for (let n = 1; n <= 60; n++) {
    const passo = 2 ** -n;
    const k = Math.ceil(baixo / passo);
    if ((k + 1) * passo <= alto) return k.toString(2).padStart(n, "0");
  }
  return null; // intervalo pequeno demais para ponto flutuante
}

// ---------- Canais e códigos corretores ----------

/** Capacidade do canal binário simétrico com probabilidade de troca p: C = 1 − h(p). */
export function capacidadeBSC(p) {
  return 1 - entropiaBinaria(p);
}

/** Passa uma sequência de bits (array de 0/1) por um canal binário simétrico. */
export function canalBSC(bits, p, rng = Math.random) {
  return bits.map((b) => (rng() < p ? 1 - b : b));
}

/** Repete cada bit n vezes. */
export function repetir(bits, n) {
  return bits.flatMap((b) => Array(n).fill(b));
}

/** Decodifica por maioria blocos de n bits repetidos. */
export function maioria(bits, n) {
  const out = [];
  for (let i = 0; i + n <= bits.length; i += n) {
    let s = 0;
    for (let j = 0; j < n; j++) s += bits[i + j];
    out.push(s * 2 > n ? 1 : 0);
  }
  return out;
}

/**
 * Hamming(7,4) na disposição clássica: posições 1..7, paridades em 1, 2 e 4.
 * Dados d1..d4 ocupam as posições 3, 5, 6, 7.
 */
export function hammingCodificar([d1, d2, d3, d4]) {
  const p1 = d1 ^ d2 ^ d4; // cobre posições 1,3,5,7
  const p2 = d1 ^ d3 ^ d4; // cobre posições 2,3,6,7
  const p4 = d2 ^ d3 ^ d4; // cobre posições 4,5,6,7
  return [p1, p2, d1, p4, d2, d3, d4];
}

/** Síndrome (0 = sem erro detectado; 1..7 = posição do bit trocado). */
export function hammingSindrome(c) {
  const s1 = c[0] ^ c[2] ^ c[4] ^ c[6];
  const s2 = c[1] ^ c[2] ^ c[5] ^ c[6];
  const s4 = c[3] ^ c[4] ^ c[5] ^ c[6];
  return s1 + 2 * s2 + 4 * s4;
}

/** Corrige até um erro e devolve { dados, corrigida, sindrome }. */
export function hammingDecodificar(c) {
  const sindrome = hammingSindrome(c);
  const corrigida = c.slice();
  if (sindrome) corrigida[sindrome - 1] ^= 1;
  return { dados: [corrigida[2], corrigida[4], corrigida[5], corrigida[6]], corrigida, sindrome };
}

/** Informação mútua I(X;Y) a partir da distribuição conjunta (matriz p[x][y]). */
export function informacaoMutua(conj) {
  const px = conj.map((l) => l.reduce((a, b) => a + b, 0));
  const py = conj[0].map((_, j) => conj.reduce((a, l) => a + l[j], 0));
  let I = 0;
  for (let i = 0; i < conj.length; i++)
    for (let j = 0; j < conj[i].length; j++) {
      const p = conj[i][j];
      if (p > 0) I += p * Math.log2(p / (px[i] * py[j]));
    }
  return I;
}

// ---------- Aleatoriedade reprodutível ----------

/** Gerador pseudoaleatório mulberry32: rng() em [0,1), reprodutível a partir da semente. */
export function criarRng(semente = 1) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sorteia um índice segundo os pesos (não precisam somar 1). */
export function sortear(pesos, rng = Math.random) {
  const t = pesos.reduce((a, b) => a + b, 0);
  let r = rng() * t;
  for (let i = 0; i < pesos.length; i++) {
    r -= pesos[i];
    if (r < 0) return i;
  }
  return pesos.length - 1;
}

// ---------- O jogo de Shannon ----------

/**
 * Limites de Shannon (1951) para a entropia por letra, a partir do número de
 * palpites que cada letra exigiu. `palpites` é um array de inteiros ≥ 1.
 * q_i = fração das letras acertadas no i-ésimo palpite.
 *   superior = −Σ q_i·log2 q_i
 *   inferior = Σ i·(q_i − q_{i+1})·log2 i
 * Devolve { superior, inferior, q } (q indexado de 1 a K).
 */
export function limitesShannon(palpites, K = 39) {
  const q = new Array(K + 2).fill(0);
  for (const g of palpites) q[Math.min(Math.max(g, 1), K)]++;
  const n = palpites.length || 1;
  for (let i = 1; i <= K; i++) q[i] /= n;
  let superior = 0, inferior = 0;
  for (let i = 1; i <= K; i++) {
    if (q[i] > 0) superior -= q[i] * Math.log2(q[i]);
    inferior += i * (q[i] - q[i + 1]) * Math.log2(i);
  }
  return { superior, inferior, q };
}
