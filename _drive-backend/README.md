# Editora UJN — implantação do catálogo

A seção pública está em `editora/` no GitHub Pages. O painel e o catálogo usam um aplicativo da Web do Google Apps Script. O código da seção pode ser publicado antes da integração. Nesse caso a página apresenta o estado «Catálogo em preparação».

## Ativar o painel

1. Na conta Google com permissão para adicionar arquivos à [pasta da Editora UJN](https://drive.google.com/drive/folders/1Oz-bisW47wXBGkmEkR5zeJ1AfPTk0BzY), crie um projeto independente em [Apps Script](https://script.google.com/). Copie `Code.gs` e crie um arquivo HTML chamado `Admin` com o conteúdo de `Admin.html`. Nas configurações do projeto, habilite a exibição do manifesto e copie `appsscript.json`.
2. Gere localmente uma senha aleatória para os administradores e o hash SHA-256 correspondente, usando, por exemplo, o comando Node.js abaixo. Guarde a senha em um gerenciador de senhas e distribua-a aos administradores pelo canal de credenciais adotado pela editora. Em **Configurações do projeto → Propriedades do script**, crie `ADMIN_PASSWORD_SHA256` e cole apenas o hash. O comando não envia os valores a nenhum serviço.
3. Selecione **Implantar → Nova implantação → App da Web**. Selecione **Executar como eu** e **Quem tem acesso → Qualquer pessoa** para o catálogo poder ler os dados públicos. Autorize o acesso a Drive e Planilhas. A senha protege as operações administrativas do aplicativo.
4. Copie o URL público de implantação, terminado em `/exec`, para `appsScriptUrl` em `editora/config.json` na branch publicada pelo GitHub Pages. Esse URL é público. Credenciais e hashes permanecem fora do GitHub.
5. Teste em uma janela anônima. Abra `/editora/`, acesse o painel, entre, publique uma obra autorizada, confira a capa, a busca e os links, e teste a função de ocultar. Se a organização restringir links anônimos no Drive ou a implantação para qualquer pessoa no Apps Script, um administrador do Google Workspace precisa habilitar essas opções para a conta de implantação.

```sh
node -e 'const c = require("node:crypto"); const p = c.randomBytes(24).toString("base64url"); console.log("Senha", p); console.log("SHA-256", c.createHash("sha256").update(p).digest("hex"));'
```

## Operação

- O primeiro cadastro cria uma planilha privada na conta de implantação para guardar a ficha e o estado das obras.
- O painel envia o PDF e a imagem de capa à pasta editorial. Cada arquivo enviado recebe acesso de leitura para quem tiver o link, conforme indicado no formulário. O painel também aceita links de arquivos já compartilhados da pasta, opção que permite cadastrar um PDF acima de 20 MB.
- O painel cadastra códigos e links para registros externos. Use ISBN, DOI ou outro identificador já emitido.
- Ocultar uma obra retira a ficha do catálogo. Para retirar também o acesso direto aos arquivos, ajuste o compartilhamento deles no Drive. A substituição de arquivos mantém os anteriores no Drive.
- Para trocar a senha, gere outra senha aleatória e atualize `ADMIN_PASSWORD_SHA256`. A troca invalida as sessões em andamento.
- Para atualizar o código do Apps Script, edite a implantação existente e selecione uma nova versão. Isso preserva o URL público configurado no GitHub Pages.

Fotografia do catálogo: [Alfons Morales, Unsplash](https://unsplash.com/photos/YLSwjSy7stw).
