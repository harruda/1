// O "Machadinho": um transformer de caracteres (4 camadas, 4 cabeças, 128 dimensões,
// contexto de 128 letras, ~820 mil parâmetros) treinado com os nove romances.
// Esta é a mesma conta que o PyTorch faz em ferramentas/treinar_rede.py, escrita à mão,
// sem bibliotecas, para rodar no navegador. Verificação em testes/rede.test.mjs.

import { K, ESPACO } from "./alfabeto.js";

const URL_PESOS = new URL("../../dados/machadinho-pesos.txt", import.meta.url).href;

/** Decodifica o arquivo de pesos (base64) num ArrayBuffer. */
export function decodificarPesos(texto) {
  const bin = atob(texto.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** float16 (IEEE 754 meia precisão) -> float32 */
function meiaParaFloat(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const hbits = u16[i];
    const s = hbits & 0x8000 ? -1 : 1;
    const e = (hbits >> 10) & 0x1f;
    const f = hbits & 0x3ff;
    if (e === 0) out[i] = s * 2 ** -14 * (f / 1024);
    else if (e === 31) out[i] = f ? NaN : s * Infinity;
    else out[i] = s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

function camadaNorm(x, g, b, out) {
  const n = x.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (x[i] - m) ** 2;
  const r = 1 / Math.sqrt(v / n + 1e-5);
  for (let i = 0; i < n; i++) out[i] = (x[i] - m) * r * g[i] + b[i];
  return out;
}

/** out = W·x + b, com W em linhas [saida][entrada] */
function linear(W, b, x, out) {
  const nin = x.length, nout = out.length;
  for (let o = 0; o < nout; o++) {
    let soma = b[o];
    const base = o * nin;
    for (let i = 0; i < nin; i++) soma += W[base + i] * x[i];
    out[o] = soma;
  }
  return out;
}

const C_GELU = Math.sqrt(2 / Math.PI);
const gelu = (x) => 0.5 * x * (1 + Math.tanh(C_GELU * (x + 0.044715 * x * x * x)));

export class Rede {
  constructor(buffer) {
    const dv = new DataView(buffer);
    const tam = dv.getUint32(0, true);
    const cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, tam)));
    this.ctx = cab.ctx;
    this.d = cab.d;
    this.camadas = cab.camadas;
    this.cabecas = cab.cabecas;
    this.p = {};
    let pos = 4 + tam;
    let total = 0;
    for (const t of cab.tensores) {
      const n = t.forma.reduce((a, b) => a * b, 1);
      this.p[t.nome] = meiaParaFloat(new Uint16Array(buffer.slice(pos, pos + 2 * n)));
      pos += 2 * n;
      total += n;
    }
    this.parametros = total;
  }

  /**
   * Nova sessão de leitura, com memória (cache de chaves e valores) própria.
   * Com `registrarAtencao`, cada passo guarda em `sessao.atencao` os pesos de atenção
   * [camada][cabeça] -> Float32Array (um peso para cada letra lida até ali).
   */
  sessao({ registrarAtencao = false } = {}) {
    return new Sessao(this, registrarAtencao);
  }

  /**
   * Distribuição do próximo símbolo antes de cada posição de `codigos`.
   * A primeira letra é prevista a partir de um espaço (início de frase).
   * Devolve um array de Float32Array(K).
   */
  distribuicoes(codigos) {
    const s = this.sessao();
    const out = [s.alimentar(ESPACO)];
    for (let i = 0; i < codigos.length - 1; i++) out.push(s.alimentar(codigos[i]));
    return out;
  }

  /** Surpresa (bits) de cada símbolo de `codigos`. */
  surpresas(codigos) {
    const ds = this.distribuicoes(codigos);
    return Float64Array.from(codigos, (c, i) => -Math.log2(ds[i][c]));
  }

  /**
   * Gera `n` símbolos a partir de `inicio`, chamando `aoGerar(simbolo, distribuicao)` a cada passo.
   * temperatura < 1 deixa a rede mais conservadora; > 1, mais ousada.
   */
  gerar(n, { inicio = [ESPACO], temperatura = 1, rng = Math.random, aoGerar } = {}) {
    const s = this.sessao();
    let p;
    for (const c of inicio) p = s.alimentar(c);
    const saida = [];
    for (let i = 0; i < n; i++) {
      const q = aplicarTemperatura(p, temperatura);
      let r = rng(), c = 0;
      for (; c < K - 1; c++) {
        r -= q[c];
        if (r < 0) break;
      }
      saida.push(c);
      aoGerar?.(c, q);
      p = s.alimentar(c);
    }
    return saida;
  }
}

/** Reescala uma distribuição: p^(1/T), normalizada. */
export function aplicarTemperatura(p, T) {
  if (T === 1) return p;
  const q = new Float32Array(p.length);
  if (T <= 0.01) {
    let m = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[m]) m = i;
    q[m] = 1;
    return q;
  }
  let soma = 0;
  for (let i = 0; i < p.length; i++) soma += q[i] = Math.pow(p[i], 1 / T);
  for (let i = 0; i < p.length; i++) q[i] /= soma;
  return q;
}

/**
 * Lê símbolos um a um, guardando chaves e valores da atenção. Quando a janela de 128
 * letras enche, recomeça a partir das últimas 64 (as posições são reiniciadas).
 */
class Sessao {
  constructor(rede, registrar = false) {
    this.r = rede;
    this.registrar = registrar;
    this.atencao = [];
    const { d, ctx, camadas } = rede;
    this.historico = [];
    this.t = 0;
    this.chaves = Array.from({ length: camadas }, () => new Float32Array(ctx * d));
    this.valores = Array.from({ length: camadas }, () => new Float32Array(ctx * d));
    this.x = new Float32Array(d);
    this.a = new Float32Array(d);
    this.qkv = new Float32Array(3 * d);
    this.att = new Float32Array(d);
    this.tmp = new Float32Array(d);
    this.h1 = new Float32Array(4 * d);
    this.logits = new Float32Array(K);
    this.pesos = new Float32Array(ctx);
  }

  /** Lê um símbolo e devolve a distribuição (Float32Array de K) do próximo. */
  alimentar(c) {
    this.historico.push(c);
    if (this.t >= this.r.ctx) {
      const manter = this.historico.slice(-this.r.ctx / 2);
      this.t = 0;
      let p;
      for (const x of manter) p = this._passo(x);
      return p;
    }
    return this._passo(c);
  }

  _passo(c) {
    const { d, cabecas, camadas, p } = this.r;
    const t = this.t;
    const hd = d / cabecas;
    const escalaAtt = 1 / Math.sqrt(hd);
    const x = this.x;
    const reg = this.registrar ? [] : null;
    const emb = p["emb.weight"], pos = p["pos.weight"];
    for (let i = 0; i < d; i++) x[i] = emb[c * d + i] + pos[t * d + i];

    for (let l = 0; l < camadas; l++) {
      const pre = `blocos.${l}.`;
      camadaNorm(x, p[pre + "ln1.weight"], p[pre + "ln1.bias"], this.a);
      linear(p[pre + "qkv.weight"], p[pre + "qkv.bias"], this.a, this.qkv);
      const K_ = this.chaves[l], V_ = this.valores[l];
      if (reg) reg.push([]);
      for (let i = 0; i < d; i++) {
        K_[t * d + i] = this.qkv[d + i];
        V_[t * d + i] = this.qkv[2 * d + i];
      }
      for (let hh = 0; hh < cabecas; hh++) {
        const o = hh * hd;
        let max = -Infinity;
        for (let j = 0; j <= t; j++) {
          let sc = 0;
          for (let i = 0; i < hd; i++) sc += this.qkv[o + i] * K_[j * d + o + i];
          sc *= escalaAtt;
          this.pesos[j] = sc;
          if (sc > max) max = sc;
        }
        let soma = 0;
        for (let j = 0; j <= t; j++) soma += this.pesos[j] = Math.exp(this.pesos[j] - max);
        for (let i = 0; i < hd; i++) {
          let v = 0;
          for (let j = 0; j <= t; j++) v += this.pesos[j] * V_[j * d + o + i];
          this.att[o + i] = v / soma;
        }
        if (reg) reg[l].push(Float32Array.from(this.pesos.subarray(0, t + 1), (w) => w / soma));
      }
      linear(p[pre + "proj.weight"], p[pre + "proj.bias"], this.att, this.tmp);
      for (let i = 0; i < d; i++) x[i] += this.tmp[i];
      camadaNorm(x, p[pre + "ln2.weight"], p[pre + "ln2.bias"], this.a);
      linear(p[pre + "fc1.weight"], p[pre + "fc1.bias"], this.a, this.h1);
      for (let i = 0; i < this.h1.length; i++) this.h1[i] = gelu(this.h1[i]);
      linear(p[pre + "fc2.weight"], p[pre + "fc2.bias"], this.h1, this.tmp);
      for (let i = 0; i < d; i++) x[i] += this.tmp[i];
    }
    camadaNorm(x, p["lnf.weight"], p["lnf.bias"], this.a);
    linear(p["saida.weight"], p["saida.bias"], this.a, this.logits);
    this.t = t + 1;
    if (reg) this.atencao.push(reg);
    let max = -Infinity;
    for (let i = 0; i < K; i++) if (this.logits[i] > max) max = this.logits[i];
    const prob = new Float32Array(K);
    let soma = 0;
    for (let i = 0; i < K; i++) soma += prob[i] = Math.exp(this.logits[i] - max);
    for (let i = 0; i < K; i++) prob[i] /= soma;
    return prob;
  }
}

let promessa = null;
/** Promessa da rede carregada (baixa ~2 MB de pesos uma vez por visita). */
export function obterRede() {
  if (!promessa)
    promessa = fetch(URL_PESOS)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("pesos da rede: " + r.status))))
      .then((t) => new Rede(decodificarPesos(t)))
      .catch((e) => {
        promessa = null;
        throw e;
      });
  return promessa;
}
