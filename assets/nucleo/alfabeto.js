// O alfabeto do livro: espaço + 26 letras + 12 letras acentuadas do português.
// Todo texto que passa por um modelo é antes reduzido a estes 39 símbolos.

export const ALFABETO = " abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúç";
export const K = ALFABETO.length; // 39
export const ESPACO = 0;

const INDICE = new Map([...ALFABETO].map((c, i) => [c, i]));
const TROCAS = { "ü": "u", "è": "e", "ë": "e", "ñ": "n", "ì": "i", "ò": "o", "ù": "u", "ª": "a", "º": "o" };

/** Índice de um caractere já normalizado (0..38), ou -1. */
export function indice(c) {
  const i = INDICE.get(c);
  return i === undefined ? -1 : i;
}

/** Leva um caractere qualquer ao alfabeto. Devolve um símbolo do alfabeto ou " " (separador). */
export function normalizarChar(c) {
  let x = c.toLowerCase();
  x = TROCAS[x] ?? x;
  if (INDICE.has(x)) return x;
  const base = x.normalize("NFD")[0];
  if (base !== " " && INDICE.has(base)) return base;
  return " ";
}

/** Normaliza um texto: minúsculas, só o alfabeto, espaços simples, sem bordas. */
export function normalizar(texto) {
  let s = "";
  for (const c of texto) s += normalizarChar(c);
  return s.replace(/ +/g, " ").trim();
}

/**
 * Normaliza preservando o vínculo com o texto original, para que se possa
 * pintar o texto original (com pontuação e maiúsculas) a partir de medidas
 * feitas sobre o texto normalizado.
 * Devolve { normalizado, mapa } em que mapa[i] é a posição em `normalizado`
 * correspondente ao caractere i do original (ou -1 se ele foi absorvido).
 */
export function alinhar(original) {
  const chars = [...original];
  const mapa = new Array(chars.length).fill(-1);
  let s = "";
  for (let i = 0; i < chars.length; i++) {
    const n = normalizarChar(chars[i]);
    if (n === " ") {
      if (s.length > 0 && s[s.length - 1] !== " ") {
        s += " ";
        mapa[i] = s.length - 1;
      }
    } else {
      s += n;
      mapa[i] = s.length - 1;
    }
  }
  // remove espaço final, se houver
  if (s.endsWith(" ")) {
    const fim = s.length - 1;
    s = s.slice(0, -1);
    for (let i = 0; i < mapa.length; i++) if (mapa[i] === fim) mapa[i] = -1;
  }
  return { normalizado: s, mapa, chars };
}

/** Converte texto normalizado em Uint8Array de índices. */
export function codificar(texto) {
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const j = INDICE.get(texto[i]);
    out[i] = j === undefined ? ESPACO : j;
  }
  return out;
}

/** Converte índices de volta em texto. */
export function decodificar(codigos) {
  let s = "";
  for (const c of codigos) s += ALFABETO[c];
  return s;
}

/** Rótulo visível de um símbolo (o espaço vira ␣). */
export function rotulo(c) {
  if (typeof c === "number") c = ALFABETO[c];
  return c === " " ? "␣" : c;
}
