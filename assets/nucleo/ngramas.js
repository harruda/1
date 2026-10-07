// Contagem de n-gramas de caracteres e o modelo de linguagem que sai delas.
//
// Um "contexto de ordem k" são os k caracteres imediatamente anteriores.
// Para cada ordem guardamos duas tabelas:
//   pares[k]:     (contexto, símbolo) -> quantas vezes o símbolo veio depois do contexto
//   contextos[k]: contexto -> [total de ocorrências, número de símbolos distintos seguintes]
// Contextos e pares são codificados como inteiros em base 40 (cabem em 53 bits até a ordem 8).
//
// A suavização é por desconto absoluto interpolado: cada ordem empresta um pouco
// de probabilidade à ordem de baixo, que por sua vez empresta à de baixo, até a
// distribuição uniforme. Assim nenhum símbolo tem probabilidade zero.

import { K } from "./alfabeto.js";

const B = 40; // base da codificação (símbolo + 1, para que contextos de tamanhos diferentes não colidam)
const VAZIO = -1;
const ESPERADO = [1, 40, 800, 6500, 29000, 92000, 245000, 510000, 850000];

/** Tabela de dispersão com chaves numéricas inteiras (até 2^53) e até dois contadores por chave. */
export class Tabela {
  constructor(capacidade = 1024, campos = 1) {
    let cap = 1;
    while (cap < capacidade * 2) cap <<= 1;
    this.cap = cap;
    this.mascara = cap - 1;
    this.n = 0;
    this.campos = campos;
    this.chaves = new Float64Array(cap).fill(VAZIO);
    this.v0 = new Uint32Array(cap);
    this.v1 = campos > 1 ? new Uint32Array(cap) : null;
  }

  static deBuffers(o) {
    const t = Object.create(Tabela.prototype);
    Object.assign(t, o);
    t.mascara = t.cap - 1;
    return t;
  }

  buffers() {
    const b = [this.chaves.buffer, this.v0.buffer];
    if (this.v1) b.push(this.v1.buffer);
    return b;
  }

  _h(k) {
    // mistura as partes alta e baixa da chave
    const lo = k % 4294967296;
    const hi = (k - lo) / 4294967296;
    let h = Math.imul(lo | 0, 0x9e3779b1) ^ Math.imul(hi | 0, 0x85ebca77);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 13;
    return h & this.mascara;
  }

  /** Posição da chave, ou -1. */
  achar(k) {
    let i = this._h(k);
    const ch = this.chaves;
    while (true) {
      const x = ch[i];
      if (x === k) return i;
      if (x === VAZIO) return -1;
      i = (i + 1) & this.mascara;
    }
  }

  /** Posição da chave, inserindo-a se necessário. Devolve [posição, nova?]. */
  _inserir(k) {
    if ((this.n + 1) * 2 > this.cap) this._crescer();
    let i = this._h(k);
    const ch = this.chaves;
    while (true) {
      const x = ch[i];
      if (x === k) return i;
      if (x === VAZIO) {
        ch[i] = k;
        this.n++;
        return ~i; // complemento sinaliza "nova"
      }
      i = (i + 1) & this.mascara;
    }
  }

  _crescer() {
    const velhas = this.chaves, a = this.v0, b = this.v1;
    this.cap *= 2;
    this.mascara = this.cap - 1;
    this.chaves = new Float64Array(this.cap).fill(VAZIO);
    this.v0 = new Uint32Array(this.cap);
    this.v1 = b ? new Uint32Array(this.cap) : null;
    this.n = 0;
    for (let i = 0; i < velhas.length; i++) {
      const k = velhas[i];
      if (k === VAZIO) continue;
      const j = ~this._inserir(k);
      this.v0[j] = a[i];
      if (b) this.v1[j] = b[i];
    }
  }

  get(k) {
    const i = this.achar(k);
    return i < 0 ? 0 : this.v0[i];
  }
}

/**
 * Conta n-gramas de `codigos` (Uint8Array de índices do alfabeto) até `ordemMax`.
 * `progresso(ordem)` é chamado ao fim de cada ordem.
 */
export function contar(codigos, ordemMax, progresso = () => {}) {
  const pares = [], contextos = [];
  const N = codigos.length;
  for (let o = 0; o <= ordemMax; o++) {
    // tamanhos esperados para ~2,6 milhões de caracteres de prosa (evita realocações)
    const P = new Tabela(Math.min(N, ESPERADO[o + 1] ?? N), 1);
    const C = new Tabela(Math.min(N, ESPERADO[o] ?? N), 2);
    const mod = B ** o;
    let ctx = 0;
    for (let i = 0; i < N; i++) {
      const s = codigos[i];
      if (i >= o) {
        const r = P._inserir(ctx * B + s);
        const nova = r < 0;
        const ip = nova ? ~r : r;
        P.v0[ip]++;
        const rc = C._inserir(ctx);
        const ic = rc < 0 ? ~rc : rc;
        C.v0[ic]++;
        if (nova) C.v1[ic]++;
      }
      if (o > 0) ctx = (ctx % (mod / B)) * B + (s + 1);
    }
    pares.push(P);
    contextos.push(C);
    progresso(o);
  }
  return { ordemMax, n: N, pares, contextos };
}

/** Desconto absoluto por ordem (ajustado no corpus de teste; ver testes/). */
export const DESCONTO = 0.8;

export class ModeloNgramas {
  constructor({ ordemMax, n, pares, contextos }) {
    this.ordemMax = ordemMax;
    this.n = n;
    this.pares = pares;
    this.contextos = contextos;
    this.d = DESCONTO;
  }

  /** Reconstrói um modelo a partir do que o worker transferiu. */
  static deMensagem(m) {
    return new ModeloNgramas({
      ordemMax: m.ordemMax,
      n: m.n,
      pares: m.pares.map(Tabela.deBuffers),
      contextos: m.contextos.map(Tabela.deBuffers),
    });
  }

  paraMensagem() {
    const plano = (t) => ({ cap: t.cap, n: t.n, campos: t.campos, chaves: t.chaves, v0: t.v0, v1: t.v1 });
    const msg = { ordemMax: this.ordemMax, n: this.n, pares: this.pares.map(plano), contextos: this.contextos.map(plano) };
    const transf = [...this.pares, ...this.contextos].flatMap((t) => t.buffers());
    return [msg, transf];
  }

  /** Códigos de contexto para cada ordem, a partir dos últimos caracteres de `hist` (array de índices). */
  _ctxs(hist, fim = hist.length) {
    const out = [0];
    let c = 0, mult = 1;
    for (let o = 1; o <= this.ordemMax; o++) {
      const j = fim - o;
      if (j < 0) break;
      c += (hist[j] + 1) * mult;
      mult *= B;
      out.push(c);
    }
    return out;
  }

  /** Contagens brutas dos símbolos seguintes a um contexto de ordem exata (Uint32Array de K). */
  contagens(hist, ordem, fim = hist.length) {
    const out = new Uint32Array(K);
    const ctxs = this._ctxs(hist, fim);
    if (ordem >= ctxs.length) return out;
    const P = this.pares[ordem], base = ctxs[ordem] * B;
    for (let s = 0; s < K; s++) out[s] = P.get(base + s);
    return out;
  }

  /**
   * Distribuição de probabilidade do próximo símbolo dado o histórico.
   * `ordem` limita o tamanho do contexto usado (-1 = uniforme).
   */
  distribuicao(hist, ordem = this.ordemMax, fim = hist.length) {
    let p = new Float64Array(K).fill(1 / K);
    if (ordem < 0) return p;
    const ctxs = this._ctxs(hist, fim);
    const omax = Math.min(ordem, ctxs.length - 1, this.ordemMax);
    for (let o = 0; o <= omax; o++) {
      const ic = this.contextos[o].achar(ctxs[o]);
      if (ic < 0) continue; // contexto nunca visto: herda a ordem de baixo
      const tot = this.contextos[o].v0[ic], dist = this.contextos[o].v1[ic];
      const P = this.pares[o], base = ctxs[o] * B;
      const peso = (this.d * dist) / tot;
      const q = new Float64Array(K);
      for (let s = 0; s < K; s++) {
        const c = P.get(base + s);
        q[s] = Math.max(c - this.d, 0) / tot + peso * p[s];
      }
      p = q;
    }
    return p;
  }

  /** Probabilidade de um símbolo específico (mais rápido que a distribuição inteira). */
  prob(hist, s, ordem = this.ordemMax, fim = hist.length) {
    let p = 1 / K;
    if (ordem < 0) return p;
    const ctxs = this._ctxs(hist, fim);
    const omax = Math.min(ordem, ctxs.length - 1, this.ordemMax);
    for (let o = 0; o <= omax; o++) {
      const ic = this.contextos[o].achar(ctxs[o]);
      if (ic < 0) continue;
      const tot = this.contextos[o].v0[ic], dist = this.contextos[o].v1[ic];
      const c = this.pares[o].get(ctxs[o] * B + s);
      p = Math.max(c - this.d, 0) / tot + ((this.d * dist) / tot) * p;
    }
    return p;
  }

  /** Surpresa (bits) de cada caractere de `codigos`, cada um previsto pelos anteriores. */
  surpresas(codigos, ordem = this.ordemMax) {
    const out = new Float64Array(codigos.length);
    for (let i = 0; i < codigos.length; i++) out[i] = -Math.log2(this.prob(codigos, codigos[i], ordem, i));
    return out;
  }

  /** Entropia cruzada média (bits por caractere) do modelo sobre `codigos`. */
  entropiaCruzada(codigos, ordem = this.ordemMax) {
    let soma = 0;
    for (let i = 0; i < codigos.length; i++) soma -= Math.log2(this.prob(codigos, codigos[i], ordem, i));
    return soma / codigos.length;
  }

  /**
   * Posição (1 = primeiro palpite) do símbolo correto na lista de palpites do modelo,
   * ordenada da maior para a menor probabilidade — o jogo de Shannon jogado pela máquina.
   */
  posicaoDoPalpite(hist, s, ordem = this.ordemMax, fim = hist.length) {
    const p = this.distribuicao(hist, ordem, fim);
    let pos = 1;
    for (let t = 0; t < K; t++) if (p[t] > p[s] || (p[t] === p[s] && t < s)) pos++;
    return pos;
  }

  /** Gera `n` caracteres a partir de `inicio` (array de índices), com `rng()` em [0,1). */
  gerar(ordem, n, rng = Math.random, inicio = []) {
    const hist = Array.from(inicio);
    for (let i = 0; i < n; i++) {
      const p = this.distribuicao(hist, ordem);
      let r = rng(), s = 0;
      for (; s < K - 1; s++) {
        r -= p[s];
        if (r < 0) break;
      }
      hist.push(s);
    }
    return hist.slice(inicio.length);
  }
}
