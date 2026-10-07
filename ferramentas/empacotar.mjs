// Gera dist/ com a página de entrada no formato de Artifact (sem <html>/<head>/<body>,
// que a hospedagem acrescenta) e lista os demais arquivos a publicar ao lado dela.
// Uso: node ferramentas/empacotar.mjs  -> escreve dist/index.html e dist/arquivos.json
import fs from "fs";
import path from "path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fonte = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
const cabeca = fonte.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, "").replace(/<meta name="viewport"[^>]*>\s*/, "");
const corpo = fonte.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.mkdirSync(path.join(raiz, "dist"), { recursive: true });
fs.writeFileSync(path.join(raiz, "dist/index.html"), `${cabeca.trim()}\n${corpo.trim()}\n`);

const pastas = ["assets", "capitulos", "paginas", "dados"];
const arquivos = {};
for (const p of pastas) {
  for (const f of fs.readdirSync(path.join(raiz, p), { recursive: true })) {
    const rel = path.join(p, f);
    if (fs.statSync(path.join(raiz, rel)).isFile()) arquivos[rel] = rel;
  }
}
fs.writeFileSync(path.join(raiz, "dist/arquivos.json"), JSON.stringify(arquivos, null, 1));
console.log(Object.keys(arquivos).length, "arquivos");
