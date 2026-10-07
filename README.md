# A Medida da Surpresa

Um livro interativo, em português, de introdução à teoria da informação. Vai do jogo de adivinhação que Claude Shannon inventou em 1950 até os modelos de linguagem de hoje, usando a obra de Machado de Assis como laboratório.

Cada capítulo mistura texto, fórmulas e experimentos que rodam no navegador: você adivinha frases de *Memorial de Aires* letra por letra, constrói códigos de Huffman, vê o intervalo da codificação aritmética encolher, manda Machado através de um canal com ruído e conversa com uma rede neural de 820 mil parâmetros treinada nos romances dele.

| | Capítulo | Assunto |
|---|---|---|
| 1 | O jogo de adivinhação | o experimento de Shannon (1951); informação como imprevisibilidade |
| 2 | Perguntas de sim ou não | o bit, logaritmos, surpresa de eventos raros, o código telegráfico |
| 3 | A média da surpresa | entropia, entropia condicional, regra da cadeia |
| 4 | O português previsível | cadeias de Markov, redundância, Machado sintético |
| 5 | Comprimir é prever | Huffman, Kraft, codificação aritmética, os limites da compressão |
| 6 | Conversa no ruído | canais, Hamming, capacidade, o teorema do canal ruidoso |
| 7 | Máquinas que adivinham | entropia cruzada, redes neurais, atenção, modelos de linguagem |

Apêndices: glossário, cartões de revisão (com exportação para Obsidian e Anki) e referências.

## Como abrir

Não há etapa de compilação. Basta servir a pasta por HTTP (os módulos e os dados são carregados com `fetch`, que não funciona abrindo o arquivo direto):

```sh
python3 -m http.server 8000
# e abra http://localhost:8000
```

Também funciona no GitHub Pages: em *Settings › Pages*, escolha publicar a partir da raiz do ramo.

## Como está organizado

```
index.html              casca do livro
assets/livro.css        tipografia, cores (claro e escuro), componentes
assets/app.js           roteamento, sumário, abertura
assets/nucleo/          o que todos os capítulos usam
  alfabeto.js           o alfabeto de 39 símbolos e a normalização de texto
  ngramas.js            contagem de n-gramas e o modelo de linguagem por contagens
  modelo.js             carrega o corpus e treina o modelo (num Web Worker)
  rede.js               o transformer "Machadinho", implementado à mão em JS
  info.js               entropia, Huffman, codificação aritmética, Hamming…
  ui.js                 elementos, controles, gráficos, marca-texto da surpresa
capitulos/cN.{html,js,css}   texto e interativos de cada capítulo
paginas/                glossário, cartões, referências
dados/                  corpus normalizado, frases de teste, pesos da rede
ferramentas/            preparação do corpus, treino da rede, capturas de tela
testes/                 testes em Node (node testes/info.test.mjs, etc.)
docs/GUIA.md            guia de estilo e contrato dos capítulos
```

## Dados

O corpus é a *Obra Completa* de Machado de Assis disponibilizada pelo MEC (machado.mec.gov.br), em domínio público, na versão empacotada pelo projeto NLTK. Os nove primeiros romances (de *Ressurreição* a *Esaú e Jacó*) servem de treino; *Memorial de Aires* (1908) fica de fora, para que toda medida de previsão seja feita em texto que os modelos nunca viram.

- `python3 ferramentas/preparar_corpus.py caminho/para/machado/` regenera `dados/`.
- `python3 ferramentas/treinar_rede.py 8000` treina a rede (PyTorch, menos de 1 h em CPU) e exporta os pesos.
- `node testes/rede.test.mjs` confere que a rede em JavaScript reproduz as probabilidades do PyTorch.

## Créditos

Escrito e programado por Claude (Anthropic), em outubro de 2026, numa sessão em que recebeu liberdade total para criar algo de que se orgulhasse. Os capítulos 2 a 6 foram redigidos por instâncias auxiliares a partir de um guia comum e revisados pelo autor do restante.

Textos de Machado de Assis em domínio público. Fontes: Old Standard TT, Literata e Martian Mono (Google Fonts, licença OFL).
