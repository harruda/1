"""Prepara o corpus de Machado de Assis usado pelo livro.

Fonte: corpus "machado" do NLTK (Obra Completa, machado.mec.gov.br, domínio público).
    https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/machado.zip

Uso:
    python3 ferramentas/preparar_corpus.py caminho/para/machado/

Gera em dados/:
    machado-treino.txt   romances 1-9, normalizados (alfabeto de 39 símbolos)
    machado-teste.txt    Memorial de Aires (1908), normalizado, nunca visto no treino
    trechos.json         frases originais (com pontuação) de Memorial de Aires
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ALFABETO = " abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúç"

ROMANCES = {
    "marm01": "Ressurreição (1872)",
    "marm02": "A Mão e a Luva (1874)",
    "marm03": "Helena (1876)",
    "marm04": "Iaiá Garcia (1878)",
    "marm05": "Memórias Póstumas de Brás Cubas (1881)",
    "marm06": "Casa Velha (1885)",
    "marm07": "Quincas Borba (1891)",
    "marm08": "Dom Casmurro (1899)",
    "marm09": "Esaú e Jacó (1904)",
}
TESTE = ("marm10", "Memorial de Aires (1908)")

TROCAS = {"ü": "u", "è": "e", "ë": "e", "ñ": "n", "ì": "i", "ò": "o", "ù": "u", "ª": "a", "º": "o"}


def normalizar_char(c):
    c = c.lower()
    c = TROCAS.get(c, c)
    if c in ALFABETO:
        return c
    # letras com diacríticos fora do alfabeto viram a letra base
    base = unicodedata.normalize("NFD", c)[0]
    if base in ALFABETO and base != " ":
        return base
    return " "


def normalizar(texto):
    s = "".join(normalizar_char(c) for c in texto)
    return re.sub(r" +", " ", s).strip()


def ler(pasta, nome):
    bruto = (pasta / "romance" / f"{nome}.txt").read_bytes().decode("cp1252", errors="replace")
    linhas = bruto.splitlines()
    # descarta o cabeçalho editorial: começa no primeiro "CAPÍTULO" ou equivalente
    for i, l in enumerate(linhas):
        if re.match(r"\s*(CAP[IÍ]TULO|I\s*$|\d+\s*$|ADVERT)", l) and i > 3:
            linhas = linhas[i:]
            break
    texto = "\n".join(linhas)
    # remove títulos de capítulo em caixa alta
    texto = re.sub(r"^\s*CAP[IÍ]TULO [^\n]*\n", "\n", texto, flags=re.M)
    texto = re.sub(r"^\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ,.\-—!?]{2,60}\s*$", "", texto, flags=re.M)
    return texto


def paragrafos(texto):
    # junta linhas quebradas de um mesmo parágrafo
    blocos = re.split(r"\n\s*\n", texto)
    out = []
    for b in blocos:
        p = re.sub(r"\s+", " ", b).strip()
        if p:
            out.append(p)
    return out


def frases(paragrafo):
    partes = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ—])", paragrafo)
    return [p.strip() for p in partes if p.strip()]


def main():
    pasta = Path(sys.argv[1])
    saida = Path(__file__).resolve().parent.parent / "dados"
    saida.mkdir(exist_ok=True)

    treino = []
    for nome in ROMANCES:
        treino.append(normalizar(ler(pasta, nome)))
    (saida / "machado-treino.txt").write_text(" ".join(treino), encoding="utf-8")

    texto_teste = ler(pasta, TESTE[0])
    (saida / "machado-teste.txt").write_text(normalizar(texto_teste), encoding="utf-8")

    selecao = []
    for p in paragrafos(texto_teste):
        for f in frases(p):
            n = normalizar(f)
            if 70 <= len(n) <= 150 and not re.search(r"[0-9\"'()/_*]", f) and f[0].isupper():
                selecao.append({"original": f, "normalizado": n})
    (saida / "trechos.json").write_text(
        json.dumps({"fonte": TESTE[1], "frases": selecao}, ensure_ascii=False, indent=0),
        encoding="utf-8",
    )
    print("treino:", sum(len(t) for t in treino), "caracteres")
    print("teste:", len(normalizar(texto_teste)), "caracteres")
    print("frases selecionadas:", len(selecao))


if __name__ == "__main__":
    main()
