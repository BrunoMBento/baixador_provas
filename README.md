# Baixador de Provas

Aplicativo desktop para Windows que percorre os concursos encerrados do
[Cebraspe](https://www.cebraspe.org.br/concursos/encerrado), encontra os PDFs da seção
**Provas e gabaritos** e os organiza em subpastas pelo identificador do concurso.

## Usar o aplicativo

1. Escolha a pasta raiz onde os downloads serão salvos.
2. Ajuste o intervalo entre o início de cada download usando o controle deslizante:
   de 0,5 a 3,5 segundos, em passos de 0,5 segundo. O padrão é 2 segundos; aumente
   o valor se o site responder com muitas solicitações (HTTP 429).
3. Marque **Substituir arquivos existentes** se quiser baixar novamente PDFs já salvos.
   Essa opção também inicia uma nova leitura dos concursos. Por padrão, arquivos
   existentes são ignorados e a leitura anterior é reaproveitada.
4. Clique em **Iniciar download**. A janela mostra o progresso, os arquivos ignorados e
   eventuais falhas. Cada concurso terá uma pasta com o nome do identificador na URL.

O aplicativo visita os detalhes dos concursos sequencialmente e baixa apenas os links
PDF encontrados na seção **Provas e gabaritos**. Acesso à internet é necessário.

Use **Pausar** e **Continuar** para interromper temporariamente a operação. A pausa
ocorre após a conclusão da leitura ou do download em andamento. O intervalo pode ser
alterado enquanto a operação está pausada e o novo valor é aplicado ao continuar.
Ao cancelar ou fechar
o aplicativo, inicie novamente com a mesma pasta para retomar: concursos já lidos não
são consultados novamente e arquivos existentes são ignorados. Concursos ou arquivos
que falharam são tentados novamente na próxima execução.

A estimativa soma o tempo médio das leituras já realizadas, multiplicado pelos
concursos ainda não lidos, ao intervalo selecionado multiplicado pelos PDFs restantes.
Durante a leitura, a quantidade de PDFs dos concursos ainda não lidos é projetada pela
média dos concursos já lidos. Até existir uma média, a estimativa fica indisponível.
Arquivos já existentes não são contados, salvo quando a substituição está selecionada.
A estimativa não inclui o tempo de transferência dos PDFs nem o tempo em pausa.

O arquivo `.baixador-provas-progresso.json` na pasta raiz guarda a lista de concursos
e seus PDFs. Mantenha-o junto dos downloads para retomar a leitura. A lista representa
o momento em que a execução foi iniciada; para atualizar os concursos e PDFs a partir
do site, marque **Substituir arquivos existentes**, o que também baixa novamente os
arquivos existentes.

## Desenvolvimento

Requer Node.js 22.13.0 ou mais recente e npm para desenvolvimento. Para instalar as
dependências e o Chromium usado pelo Playwright:

```sh
npm install
npm run setup:browser
npm start
```

Para executar os testes:

```sh
npm test
```

## Pacote portátil para Windows

Execute o empacotamento em um computador Windows para incluir o Chromium compatível com
Windows:

```sh
npm install
npm run setup:browser
npm run make:win
```

O ZIP portátil será criado na pasta `out/make/`. O usuário final não precisa instalar
Node.js nem ferramentas de desenvolvimento. O pacote inclui o Electron e somente o
Chromium headless do Playwright, sem duplicar os navegadores instalados para desenvolvimento.

O repositório não deve conter credenciais ou tokens. Antes de distribuir uma versão,
teste o ZIP em uma instalação limpa do Windows e publique o hash SHA-256 junto ao
artefato.

## Publicar uma versão com GitHub Actions

O workflow de release usa um runner Windows do GitHub para instalar o Chromium
headless compatível, executar os testes, gerar o ZIP portátil e publicá-lo no GitHub Releases
junto com seu hash SHA-256. Não é necessário configurar um token pessoal: o workflow
usa o `GITHUB_TOKEN` disponibilizado pelo GitHub.

No Linux, para atualizar a versão, criar um commit com **todas as alterações não
ignoradas**, enviar a branch `main` e publicar a tag, execute:

```sh
./subir-versao.sh 1.0.2
```

Confira as alterações com `git status` antes de executar o script. Use uma versão
nova e esteja na branch `main`. Se o envio falhar depois do commit, corrija o problema,
envie a branch com `git push origin main` e execute `./publicar-release.sh`.

Para preparar a versão e o commit manualmente, atualize as versões com
`npm version 1.0.2 --no-git-tag-version`, faça commit e envie a branch para `origin`.
Depois execute:

```sh
./publicar-release.sh
```

Esse script exige a branch sincronizada e sem alterações locais, confere as versões e
cria e envia a tag correspondente; ele não cria commits nem altera a versão. Se o
envio da tag falhar, execute-o novamente para reutilizar a tag local.

Acompanhe a execução na aba **Actions** do repositório. Quando terminar, baixe o ZIP
em **Releases** ou em `https://github.com/BrunoMBento/baixador_provas/releases/latest`.

O ZIP contém o `.exe` e os recursos necessários; extraia todos os arquivos antes de
executar. A publicação ocorre apenas após os testes e o empacotamento terminarem com
sucesso. Cada versão exige uma nova tag. O runner do GitHub não substitui o teste em
uma instalação Windows limpa antes da distribuição; arquivos não assinados também
podem gerar alertas do Windows.