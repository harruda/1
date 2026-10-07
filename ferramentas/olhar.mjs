// Abre páginas do livro num Chromium sem cabeça, registra erros do console e tira capturas.
// Uso: node ferramentas/olhar.mjs <saida/> <ancora>[,<ancora>...] [--largura=1280] [--tema=dark] [--esperar=ms] [--inteira]
// Requer um servidor local em http://127.0.0.1:8123 (ex.: npx http-server -p 8123 -c-1 .)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const [saida, ancoras, ...resto] = process.argv.slice(2);
const opt = Object.fromEntries(resto.map((a) => a.replace(/^--/, "").split("=")));
const largura = +(opt.largura ?? 1280);
const navegador = await chromium.launch();
const ctx = await navegador.newContext({
  viewport: { width: largura, height: +(opt.altura ?? 900) },
  colorScheme: opt.tema === "dark" ? "dark" : "light",
  deviceScaleFactor: 1,
});
const pagina = await ctx.newPage();
const erros = [];
pagina.on("console", (m) => (m.type() === "error" || m.type() === "warning") && erros.push(`[${m.type()}] ${m.text()}`));
pagina.on("pageerror", (e) => erros.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
pagina.on("requestfailed", (r) => erros.push(`[falhou] ${r.url()} ${r.failure()?.errorText}`));
for (const a of ancoras.split(",")) {
  await pagina.goto(`http://127.0.0.1:8123/#${a}`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(+(opt.esperar ?? 2500));
  const larguraDoc = await pagina.evaluate(() => document.documentElement.scrollWidth);
  if (larguraDoc > largura + 1) erros.push(`[transborda] #${a}: largura do documento ${larguraDoc} > ${largura}`);
  const nome = `${saida}/${a}-${largura}${opt.tema === "dark" ? "-escuro" : ""}.png`;
  await pagina.screenshot({ path: nome, fullPage: "inteira" in opt });
  console.log("captura:", nome);
}
console.log(erros.length ? erros.join("\n") : "sem erros no console");
await navegador.close();
