"""Treina o "Machadinho": um transformer minúsculo, de caracteres, nos nove romances.

É a mesma arquitetura dos grandes modelos de linguagem (GPT), em escala de brinquedo:
4 camadas, 4 cabeças de atenção, vetores de 128 dimensões, contexto de 128 letras.
Os pesos são exportados em float16 (base64) para dados/machadinho-pesos.txt e o navegador roda a rede
(ver assets/nucleo/rede.js). A verificação numérica entre as duas implementações está em
dados/machadinho-verificacao.json.

Uso (requer PyTorch):
    python3 ferramentas/treinar_rede.py [passos]
"""
import base64
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

RAIZ = Path(__file__).resolve().parent.parent
ALFABETO = " abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúç"
K = len(ALFABETO)
CTX, D, CAMADAS, CABECAS = 128, 128, 4, 4

torch.manual_seed(1899)  # ano de Dom Casmurro
torch.set_num_threads(4)


def codificar(t):
    idx = {c: i for i, c in enumerate(ALFABETO)}
    return torch.tensor([idx.get(c, 0) for c in t], dtype=torch.long)


class Bloco(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1 = nn.LayerNorm(D)
        self.qkv = nn.Linear(D, 3 * D)
        self.proj = nn.Linear(D, D)
        self.ln2 = nn.LayerNorm(D)
        self.fc1 = nn.Linear(D, 4 * D)
        self.fc2 = nn.Linear(4 * D, D)

    def forward(self, x):
        B, T, _ = x.shape
        q, k, v = self.qkv(self.ln1(x)).split(D, dim=2)
        hd = D // CABECAS
        q, k, v = (t.view(B, T, CABECAS, hd).transpose(1, 2) for t in (q, k, v))
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        x = x + self.proj(a.transpose(1, 2).reshape(B, T, D))
        x = x + self.fc2(F.gelu(self.fc1(self.ln2(x)), approximate="tanh"))
        return x


class Machadinho(nn.Module):
    def __init__(self):
        super().__init__()
        self.emb = nn.Embedding(K, D)
        self.pos = nn.Embedding(CTX, D)
        self.blocos = nn.ModuleList(Bloco() for _ in range(CAMADAS))
        self.lnf = nn.LayerNorm(D)
        self.saida = nn.Linear(D, K)

    def forward(self, idx):
        T = idx.shape[1]
        x = self.emb(idx) + self.pos(torch.arange(T))
        for b in self.blocos:
            x = b(x)
        return self.saida(self.lnf(x))


def bits_por_letra(modelo, dados, n=40000):
    """Entropia cruzada em Memorial de Aires com janela deslizante (cada letra vê até CTX anteriores)."""
    modelo.eval()
    dados = dados[: n + 1]
    total, cont = 0.0, 0
    passo = CTX // 2
    with torch.no_grad():
        for ini in range(0, len(dados) - 1, passo):
            fim = min(ini + CTX, len(dados) - 1)
            x = dados[ini:fim].unsqueeze(0)
            y = dados[ini + 1 : fim + 1]
            logp = F.log_softmax(modelo(x)[0], -1)
            # conta só as posições novas (as primeiras já foram contadas na janela anterior)
            de = 0 if ini == 0 else CTX - passo
            nll = -logp[torch.arange(len(y)), y][de:]
            total += nll.sum().item()
            cont += len(nll)
            if fim == len(dados) - 1:
                break
    modelo.train()
    return total / cont / math.log(2)


def exportar(modelo, caminho):
    """Formato: cabeçalho JSON (tamanho em uint32) + tensores float16 na ordem listada,
    tudo codificado em base64 num arquivo de texto (hospedagens de páginas servem texto
    com mais boa vontade do que binário)."""
    tensores = []
    for nome, p in modelo.state_dict().items():
        tensores.append((nome, p.detach().cpu().numpy().astype(np.float16)))
    cab = {
        "ctx": CTX, "d": D, "camadas": CAMADAS, "cabecas": CABECAS, "alfabeto": ALFABETO,
        "tensores": [{"nome": n, "forma": list(a.shape)} for n, a in tensores],
    }
    b = json.dumps(cab, ensure_ascii=False).encode("utf-8")
    b += b" " * ((-len(b) - 4) % 8)  # alinha os dados em 8 bytes
    bruto = np.uint32(len(b)).tobytes() + b + b"".join(a.tobytes() for _, a in tensores)
    with open(caminho, "w") as f:
        f.write(base64.b64encode(bruto).decode("ascii"))


def main():
    passos = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    treino = codificar((RAIZ / "dados/machado-treino.txt").read_text(encoding="utf-8"))
    teste = codificar((RAIZ / "dados/machado-teste.txt").read_text(encoding="utf-8"))
    modelo = Machadinho()
    nparam = sum(p.numel() for p in modelo.parameters())
    print(f"parâmetros: {nparam}", flush=True)
    opt = torch.optim.AdamW(modelo.parameters(), lr=3e-3, betas=(0.9, 0.98), weight_decay=0.05)
    lote = 64
    historico = []
    t0 = time.time()
    for passo in range(1, passos + 1):
        # aquecimento + decaimento cosseno
        lr = 3e-3 * min(1, passo / 300) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * passo / passos)))
        for g in opt.param_groups:
            g["lr"] = lr
        ix = torch.randint(len(treino) - CTX - 1, (lote,))
        x = torch.stack([treino[i : i + CTX] for i in ix])
        y = torch.stack([treino[i + 1 : i + CTX + 1] for i in ix])
        perda = F.cross_entropy(modelo(x).view(-1, K), y.view(-1))
        opt.zero_grad(set_to_none=True)
        perda.backward()
        torch.nn.utils.clip_grad_norm_(modelo.parameters(), 1.0)
        opt.step()
        if passo % 250 == 0 or passo == passos:
            bpc = bits_por_letra(modelo, teste, 20000)
            historico.append({"passo": passo, "treino": perda.item() / math.log(2), "teste": bpc})
            print(f"passo {passo}  treino {perda.item()/math.log(2):.3f}  teste {bpc:.3f} bits/letra  {time.time()-t0:.0f}s", flush=True)
            torch.save(modelo.state_dict(), RAIZ / "ferramentas/.machadinho.pt")

    final = bits_por_letra(modelo, teste, len(teste) - 1)
    print(f"final (Memorial de Aires inteiro): {final:.4f} bits/letra", flush=True)
    exportar(modelo, RAIZ / "dados/machadinho-pesos.txt")

    # verificação: probabilidades da rede para uma frase, para conferir a implementação em JS
    frase = "capitu tinha olhos de cigana obliqua e dissimulada"
    x = codificar(frase).unsqueeze(0)
    modelo.eval()
    with torch.no_grad():
        # usa os pesos já arredondados para float16, como o navegador
        for p in modelo.parameters():
            p.copy_(p.half().float())
        logp = F.log_softmax(modelo(x)[0], -1)
    verif = {
        "frase": frase,
        "logprob_proximo": [logp[i, x[0, i + 1]].item() for i in range(x.shape[1] - 1)],
        "distribuicao_final": logp[-1].exp().tolist(),
    }
    (RAIZ / "dados/machadinho-verificacao.json").write_text(json.dumps(verif))
    (RAIZ / "dados/machadinho-treino.json").write_text(
        json.dumps({"parametros": nparam, "historico": historico, "teste_final": final}, indent=1)
    )


if __name__ == "__main__":
    main()
