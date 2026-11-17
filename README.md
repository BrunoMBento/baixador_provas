# Baixador de Provas

Aplicativo desktop para Windows que percorre os concursos encerrados do
[Cebraspe](https://www.cebraspe.org.br/concursos/encerrado), encontra os PDFs da seção
**Provas e gabaritos** e os organiza em subpastas pelo identificador do concurso.

## Usar o aplicativo

1. Escolha a pasta raiz onde os downloads serão salvos.
2. Configure o intervalo entre o início de cada download em milissegundos. O padrão é
   1500 ms; aumente o valor se o site responder com muitas solicitações (HTTP 429).
3. Marque **Substituir arquivos existentes** se quiser baixar novamente PDFs já salvos.
   Por padrão, arquivos existentes são ignorados.
4. Clique em **Iniciar download**. A janela mostra o progresso, os arquivos ignorados e
   eventuais falhas. Cada concurso terá uma pasta com o nome do identificador na URL.

O aplicativo visita os detalhes dos concursos sequencialmente e baixa apenas os links
PDF encontrados na seção **Provas e gabaritos**. Acesso à internet é necessário.

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
Node.js nem ferramentas de desenvolvimento. O primeiro pacote é grande porque inclui o
Electron e o navegador Playwright.

O repositório não deve conter credenciais ou tokens. Antes de distribuir uma versão,
teste o ZIP em uma instalação limpa do Windows e publique o hash SHA-256 junto ao
artefato.

## Publicar uma versão com GitHub Actions

O workflow de release usa um runner Windows do GitHub para instalar o Chromium
compatível, executar os testes, gerar o ZIP portátil e publicá-lo no GitHub Releases
junto com seu hash SHA-256. Não é necessário configurar um token pessoal: o workflow
usa o `GITHUB_TOKEN` disponibilizado pelo GitHub.

1. Confirme e envie os arquivos do projeto, incluindo `.github/workflows/release.yml`,
   `package.json` e `package-lock.json`, para o repositório no GitHub.
2. Confira a versão em `package.json`. Para uma nova versão, atualize-a junto com o
   lockfile (por exemplo, com `npm version 1.0.1 --no-git-tag-version`), confirme e
   envie as alterações.
3. Crie e envie uma tag que corresponda exatamente à versão. Para a versão `1.0.0`:

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

4. Acompanhe a execução na aba **Actions** do repositório. Quando terminar, baixe o
   ZIP em **Releases** ou em
   `https://github.com/BrunoMBento/baixador_provas/releases/latest`.

O ZIP contém o `.exe` e os recursos necessários; extraia todos os arquivos antes de
executar. A publicação ocorre apenas após os testes e o empacotamento terminarem com
sucesso. Cada versão exige uma nova tag. O runner do GitHub não substitui o teste em
uma instalação Windows limpa antes da distribuição; arquivos não assinados também
podem gerar alertas do Windows.