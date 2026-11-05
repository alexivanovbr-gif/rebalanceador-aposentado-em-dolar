# Rebalanceador por Aporte | Investidor Aposentado

Calculadora de rebalanceamento de carteira por aporte do método Investidor Aposentado.
Feita em HTML, CSS e JavaScript puro, sem backend e sem dependências. Funciona no celular e no computador.

> **Aviso:** ferramenta educacional de cálculo. Não é recomendação de investimento.

## O que faz

Você informa as classes da carteira (com % ideal), os ativos de cada classe (cotas, preço, moeda e % ideal dentro da classe) e o valor do próximo aporte. A ferramenta mostra quanto colocar em cada classe e quantas cotas comprar de cada ativo para aproximar a carteira da alocação ideal, **sem nunca sugerir venda**.

* Várias carteiras salvas, com criar, renomear, excluir e alternar.
* Cotação USD/BRL digitada à mão; posições em dólar são convertidas para reais nos totais.
* Resumo editável com cor, nome e % ideal, reordenação por arrastar (ou setas do teclado na alça).
* Etiqueta de % atual em **laranja** quando está abaixo do ideal e **verde** quando está no ideal ou acima.
* Aviso quando a soma dos % ideais não fecha 100% (o cálculo normaliza os percentuais).
* Gráfico de rosca da alocação atual por classes ou por ativos.
* Classes e ativos podem ser ignorados no aporte.
* Ativos sem "aceita fração" compram só cotas inteiras.
* "Aceitar sugestões" soma as cotas sugeridas às cotas atuais e zera o aporte.
* Importar e exportar carteiras em arquivo JSON.
* Tudo fica salvo no `localStorage` do navegador. Nenhum dado é enviado a servidores, e preços não são buscados na internet.

## Regra de cálculo

1. Patrimônio após aporte = patrimônio atual das classes não ignoradas + aporte.
2. Para cada classe: alvo = % ideal (normalizado entre as classes não ignoradas) x patrimônio após aporte. Disponível = alvo menos posição atual.
3. Se algum Disponível for negativo, ele vira zero e os demais são reduzidos proporcionalmente até a soma fechar o aporte.
4. Dentro de cada classe, a mesma regra é aplicada entre os ativos, usando o % ideal do ativo e o Disponível da classe como aporte.
5. Ativo com "aceita fração" desligado compra só cotas inteiras. A sobra vai para o Saldo da classe e é reaproveitada, uma cota por vez, no ativo mais distante da meta cujo preço caiba na sobra (ou em um ativo fracionário da classe).
6. Posição do ativo = cotas x preço (convertido para BRL). % atual do ativo na classe = posição do ativo / posição da classe.
7. Com aporte zero, todas as sugestões ficam em zero.

Detalhes: se todos os % ideais de um grupo forem zero, o cálculo divide em partes iguais. Ativos com preço zero não recebem aporte. A cor da etiqueta tem tolerância de 0,05 ponto percentual para evitar ruído de arredondamento.

O motor de cálculo fica isolado em [`js/calc.js`](js/calc.js), sem acesso à tela, para poder ser testado.

## Estrutura

```
index.html          página
css/style.css       identidade visual e layout responsivo
js/calc.js          motor de cálculo (funções puras)
js/store.js         carteira de exemplo, importação, números em pt-BR e localStorage
js/app.js           interface
tests/              testes automatizados (node:test)
logo.png            opcional: se existir na raiz, aparece no cabeçalho
```

## Como rodar localmente

Abra o `index.html` no navegador. Para servir por HTTP (recomendado, para o logotipo e o `localStorage` se comportarem como no site publicado):

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Como rodar os testes

Requer Node.js 18 ou mais recente. Não há dependências para instalar.

```bash
npm test
```

O comando equivale a `node --test tests/*.test.js`. Os testes cobrem:

* soma dos Disponíveis igual ao aporte;
* classe acima da meta (fica com zero e as demais são reduzidas proporcionalmente);
* classe ignorada e ativo ignorado;
* ativo de cota inteira gerando saldo, reaproveitamento da sobra e sobra que não cabe em nenhum ativo;
* percentuais que não fecham 100%;
* moedas misturadas (USD convertido para BRL);
* cálculos do item 6 (posição do ativo e % atual na classe);
* aporte zero, aporte inválido e "Aceitar sugestões";
* teste de propriedade com 300 carteiras aleatórias (Usado + Saldo = aporte, nada negativo, cotas inteiras respeitadas);
* leitura de números em pt-BR, importação e exportação JSON e persistência.

Os testes também rodam automaticamente no GitHub Actions a cada push ([`.github/workflows/testes.yml`](.github/workflows/testes.yml)).

## Logotipo

Coloque um arquivo `logo.png` na raiz do repositório e ele aparece no cabeçalho, sobre o fundo azul royal. Se o arquivo não existir, o cabeçalho mostra o texto "INVESTIDOR APOSENTADO" estilizado. O logo é exibido com 60 px de altura no computador e 46 px no celular. Use fundo transparente e **sem margens vazias** em volta do desenho, pois a margem também conta na altura e deixa o logo pequeno. Uma imagem com cerca de 200 px de altura já fica nítida em telas de alta resolução.

## Publicar no GitHub Pages

1. Faça o merge na branch `main`.
2. No repositório, vá em **Settings > Pages**.
3. Em **Build and deployment**, escolha **Source: Deploy from a branch**, branch `main` e pasta `/ (root)`. Salve.
4. Em um ou dois minutos o site fica disponível em `https://SEU-USUARIO.github.io/rebalanceador-aposentado-em-dolar/`.

O arquivo `.nojekyll` na raiz faz o Pages servir os arquivos como estão.

## Incorporar no WordPress com iframe

No editor de blocos, adicione um bloco **HTML personalizado** e cole:

```html
<iframe
  id="rebalanceador-ia"
  src="https://SEU-USUARIO.github.io/rebalanceador-aposentado-em-dolar/"
  title="Rebalanceador por aporte | Investidor Aposentado"
  style="width:100%;height:2400px;border:0;border-radius:18px;"
  loading="lazy"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://SEU-USUARIO.github.io') return;
    if (e.data && e.data.type === 'investidor-aposentado:altura') {
      document.getElementById('rebalanceador-ia').style.height = (e.data.height + 20) + 'px';
    }
  });
</script>
```

Troque `SEU-USUARIO` pelo seu usuário do GitHub. O script é opcional: quando presente, o iframe ajusta a altura sozinho conforme o conteúdo (o app envia a altura para a página via `postMessage`). Sem ele, a altura fixa de 2400 px vale, com rolagem interna se necessário.

Observações:

* Alguns planos do WordPress.com não permitem `<script>` em blocos. Nesse caso use só o `<iframe>` com a altura fixa.
* Dentro de um iframe, o navegador guarda o `localStorage` separado por site que incorpora. Os dados salvos no site do WordPress não são os mesmos salvos acessando o GitHub Pages diretamente. Use **Exportar** e **Importar** para levar carteiras de um lugar para outro.
* Alguns navegadores com bloqueio rígido de dados de terceiros podem não guardar dados dentro do iframe. Se isso acontecer, o app avisa e você pode exportar a carteira em JSON.
