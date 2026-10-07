// Worker: lê o corpus e conta os n-gramas fora da linha principal, para a página não travar.
import { codificar } from "./alfabeto.js";
import { contar, ModeloNgramas } from "./ngramas.js";

self.onmessage = async (e) => {
  const { url, ordemMax } = e.data;
  try {
    const texto = await (await fetch(url)).text();
    self.postMessage({ tipo: "lido", n: texto.length });
    const codigos = codificar(texto);
    const m = new ModeloNgramas(contar(codigos, ordemMax, (o) => self.postMessage({ tipo: "ordem", ordem: o })));
    const [msg, transf] = m.paraMensagem();
    self.postMessage({ tipo: "pronto", modelo: msg }, transf);
  } catch (err) {
    self.postMessage({ tipo: "erro", mensagem: String(err) });
  }
};
