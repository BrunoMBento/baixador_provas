# Proposta: aplicativo desktop para download e organização de arquivos

## 1. Objetivo

Criar uma aplicação simples para Windows que automatize a navegação em
um site, localize arquivos, faça os downloads e organize os arquivos em
pastas.

O usuário final não é da área de TI. Portanto, a aplicação deve oferecer
uma interface gráfica simples, sem exigir a instalação de Node.js,
Python ou outras ferramentas de desenvolvimento.

## 2. Distribuição do aplicativo

### GitHub Releases

Uma opção prática para distribuir novas versões é utilizar o **GitHub
Releases**.

-   É possível utilizar Releases em uma conta gratuita do GitHub.

-   Repositórios públicos e privados podem ter Releases.

-   Os arquivos executáveis podem ser anexados às versões.

-   É possível manter um histórico de versões.

-   O usuário pode baixar a versão mais recente por um endereço como:

    `https://github.com/USUARIO/REPOSITORIO/releases/latest`

**Atenção à privacidade:** se o repositório for privado, o usuário
precisará ter permissão de acesso. Se for público, qualquer pessoa
poderá baixar o aplicativo e consultar o código-fonte. Não publique
credenciais, tokens ou informações sensíveis no repositório ou nos
artefatos.

O GitHub possui limites e políticas de armazenamento e tráfego que devem
ser conferidos caso a distribuição cresça.

### Google Drive e e-mail

-   O Gmail costuma bloquear anexos executáveis, inclusive em
    determinados arquivos compactados.
-   O Google Drive pode permitir o armazenamento e compartilhamento de
    executáveis, mas pode aplicar avisos ou restrições de segurança.
-   O GitHub Releases é uma alternativa organizada para distribuir
    versões e manter um link estável para a versão mais recente.

## 3. Atenção aos avisos de segurança do Windows

Um executável baixado da internet pode provocar alertas do Microsoft
Defender SmartScreen ou de outros antivírus. Isso pode ocorrer mesmo
quando o programa é legítimo.

Para reduzir problemas de distribuição:

-   Evitar comportamentos e empacotamentos desnecessariamente suspeitos.
-   Manter versões consistentes e documentar as alterações.
-   Disponibilizar o hash SHA-256 do arquivo para permitir a conferência
    de integridade.
-   Considerar assinatura digital de código caso o aplicativo passe a
    ter distribuição recorrente ou para um público maior.

A assinatura digital pode ajudar a identificar o publicador, mas não
garante que todos os avisos de reputação desapareçam imediatamente.

## 4. Tecnologia recomendada

Como o desenvolvedor já trabalha com Node.js, a recomendação é:

  -----------------------------------------------------------------------
  Componente              Tecnologia              Responsabilidade
  ----------------------- ----------------------- -----------------------
  Aplicativo desktop      Electron                Criar a janela e
                                                  empacotar a aplicação

  Interface               HTML, CSS e JavaScript  Apresentar os controles
                                                  ao usuário

  Lógica da aplicação     Node.js                 Coordenar o processo de
                                                  download

  Automação do site       Playwright              Navegar pelo site e
                                                  localizar arquivos

  Empacotamento           Electron Forge          Gerar os artefatos de
                                                  distribuição

  Distribuição            GitHub Releases         Publicar e
                                                  disponibilizar versões
  -----------------------------------------------------------------------

### Por que Electron?

Electron permite desenvolver a interface com tecnologias web e
executá-la em uma aplicação desktop. O pacote inclui o runtime
necessário, de modo que o usuário final não precisa instalar Node.js.

A desvantagem é o tamanho: o Electron inclui o Chromium e o runtime
Node.js, tornando a distribuição maior do que alternativas que utilizam
o WebView do sistema operacional.

### E o Tauri?

Tauri é uma alternativa que utiliza tecnologias web para a interface e o
WebView2 no Windows, em vez de empacotar o Chromium. Isso normalmente
resulta em aplicações menores.

Entretanto, para este projeto, Electron tende a ser um caminho mais
direto, especialmente pela integração com Node.js e pelo uso pretendido
do Playwright.

## 5. Arquitetura proposta

A aplicação pode ser dividida em três partes:

1.  **Interface Electron:** janela desktop com os campos, botões e
    indicadores.
2.  **Serviços Node.js:** lógica para controlar a automação, downloads e
    organização.
3.  **Playwright:** automação do navegador para acessar o site e
    localizar os arquivos.

Fluxo simplificado:

``` text
              Downloader.exe
                    |
                 Electron
                    |
             Interface gráfica
                    |
             Processo principal
                    |
                Node.js
                    |
                Playwright
                    |
              Site de origem
                    |
             Arquivos localizados
                    |
               Downloads
                    |
           Pastas organizadas
```

## 6. Interface sugerida

A janela deve ser simples e objetiva. Uma proposta de conteúdo:

``` text
+------------------------------------------+
|           DOWNLOAD DE ARQUIVOS           |
|                                          |
|  Pasta de destino:                       |
|  [ C:\\Users\\Usuario\\Documents ] [Abrir] |
|                                          |
|               [ INICIAR ]               |
|                                          |
|  Progresso:                              |
|  [==================          ] 65%     |
|                                          |
|  Arquivos encontrados: 20                |
|  Arquivos baixados: 13                   |
|                                          |
|  Status: Baixando arquivo 14...          |
|                                          |
|  [Cancelar]                              |
+------------------------------------------+
```

### Funcionalidades recomendadas

-   Campo para informar a pasta de destino.
-   Botão para abrir o seletor de diretórios do Windows.
-   Botão para iniciar o processamento.
-   Barra de progresso.
-   Quantidade de arquivos encontrados.
-   Quantidade de arquivos baixados.
-   Mensagem de status da operação.
-   Botão para cancelar.
-   Resumo final com sucessos e falhas.

A seleção de pasta deve usar o diálogo nativo do Electron, evitando que
o usuário precise digitar caminhos manualmente.

## 7. Estrutura inicial de diretórios

Uma estrutura possível para o projeto:

``` text
downloader/
├── src/
│   ├── main/
│   │   ├── main.js
│   │   └── preload.js
│   ├── renderer/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── renderer.js
│   └── services/
│       ├── browser.js
│       ├── scraper.js
│       ├── downloader.js
│       └── organizer.js
├── package.json
└── forge.config.js
```

Responsabilidades sugeridas:

-   `main.js`: inicialização da janela Electron e coordenação dos
    processos.
-   `preload.js`: expor à interface somente as operações necessárias, de
    forma controlada.
-   `renderer.js`: tratar os eventos da interface e atualizar o
    progresso.
-   `browser.js`: iniciar e configurar a automação do navegador.
-   `scraper.js`: navegar pelo site e localizar os arquivos.
-   `downloader.js`: realizar os downloads.
-   `organizer.js`: criar diretórios e salvar cada arquivo no local
    correto.

## 8. Segurança e comunicação entre Electron e interface

A aplicação deve seguir as práticas recomendadas pelo Electron:

-   Habilitar `contextIsolation`.
-   Manter `nodeIntegration` desabilitado na interface.
-   Utilizar `preload.js` para expor uma API pequena e específica.
-   Usar IPC para comunicação entre a interface e o processo principal.
-   Validar os caminhos recebidos antes de gravar arquivos.
-   Não executar conteúdo remoto dentro da janela principal do
    aplicativo.

A interface não deve ter acesso irrestrito às APIs do Node.js.

## 9. Empacotamento e distribuição

O objetivo é entregar uma aplicação que funcione no Windows sem exigir a
instalação de ferramentas de desenvolvimento.

Há duas formas de distribuição a considerar:

### Aplicação portátil

Gerar uma pasta com o executável e os recursos necessários. O usuário
extrai o ZIP e executa o aplicativo.

Exemplo conceitual:

``` text
Downloader/
├── Downloader.exe
└── resources/
    └── ...
```

### Instalador

Gerar um instalador que coloque o aplicativo no computador e crie
atalhos. É mais familiar para alguns usuários, mas envolve uma etapa de
instalação.

Para este caso, a versão portátil é uma boa primeira opção, desde que
todos os componentes necessários sejam incluídos.

### Playwright e navegador

O Playwright precisa de um navegador compatível. A distribuição deve
incluir ou disponibilizar os componentes de navegador necessários. Isso
pode aumentar o tamanho do pacote.

É importante testar o artefato em uma máquina Windows limpa, sem
Node.js, Python ou ferramentas de desenvolvimento instaladas.

## 10. Próximas decisões necessárias

Antes de implementar, é necessário esclarecer:

1.  **Autenticação:** o site exige login e senha?
2.  **Sessão:** o usuário deverá informar credenciais no aplicativo, ou
    será possível utilizar uma sessão já autenticada?
3.  **Localização dos arquivos:** os arquivos aparecem em uma página, em
    várias páginas ou em uma estrutura de categorias?
4.  **Organização:** quais critérios determinam o nome e a hierarquia
    das pastas?
5.  **Volume:** quantos arquivos são baixados em uma execução,
    aproximadamente?
6.  **Reexecução:** se o aplicativo for executado novamente, deve
    ignorar arquivos existentes, substituí-los ou criar uma nova pasta?
7.  **Falhas:** como tratar arquivos indisponíveis ou downloads
    interrompidos?

Essas respostas influenciam a implementação do Playwright, o
gerenciamento de sessão, a estratégia de download e a organização dos
diretórios.

## 11. Referências oficiais

-   Electron: https://www.electronjs.org/docs/latest/
-   Electron Forge:
    https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging
-   Playwright: https://playwright.dev/
-   GitHub Releases:
    https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
-   Segurança do Electron:
    https://www.electronjs.org/docs/latest/tutorial/security

## 12. Recomendação final

Para a primeira versão, a recomendação é desenvolver um aplicativo
**Electron + Node.js + Playwright**, com interface pequena e objetiva,
seleção de pasta de destino, botão de execução, progresso e resumo dos
downloads.

O código deve ficar organizado em módulos, separando interface,
automação do site, download e organização dos arquivos. Depois de
validar o funcionamento, o projeto pode ser empacotado com Electron
Forge e publicado no GitHub Releases.

O principal ponto pendente antes de iniciar a implementação é entender
como o site funciona, especialmente se exige autenticação e como os
arquivos são encontrados.
