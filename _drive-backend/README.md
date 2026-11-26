# Painel editorial da Editora UJN

O painel do Apps Script cadastra as obras na planilha editorial privada. A sincronização existente gera `editora/obras.json` a partir dessa planilha. Os arquivos enviados pelo painel ficam em uma pasta privada enquanto a obra é rascunho. Quando a obra é marcada como publicada, o painel move o PDF e a capa para a pasta de livros da Editora UJN e grava os links na ficha. O endereço público é gerado pelo ISBN.

## Implantação

1. Em [Apps Script](https://script.google.com/), use a conta Google responsável, com permissão de edição na planilha editorial e na pasta de livros. Crie um projeto independente e copie `Code.gs`, `Admin.html` (arquivo HTML chamado `Admin`) e `appsscript.json`. O manifesto habilita o serviço avançado Google Sheets.
2. Em **Configurações do projeto → Propriedades do script**, adicione `EDITORIAL_SPREADSHEET_ID` com o ID da planilha privada que já alimenta o catálogo.
3. Em **Implantar → Nova implantação → Aplicativo da Web**, selecione **Executar como eu** e restrinja o acesso a **Somente eu**. Autorize o Drive e o Google Sheets com a conta responsável.
4. Salve o URL da implantação terminado em `/exec` na chave `appsScriptUrl` de `editora/config.json`. O URL do painel pode ser publicado. A conta, o ID da planilha e as permissões são administrados no Google.
5. Abra a [área administrativa](https://publisherujn.com/editora/administracao/). Teste um rascunho com um PDF e confira a ficha e o arquivo no Drive. Confira o acesso à página por ISBN após a sincronização de uma obra autorizada.

## Limites e operação

- O formulário aceita PDF de até 20 MB e capa opcional de até 4 MB. O PDF é obrigatório para publicar.
- Selecione **Publicado** e confirme a autorização para incluir a obra no catálogo. A página fica disponível depois da próxima sincronização.
- Ao passar uma obra para **Rascunho**, o painel devolve os arquivos atuais gerenciados por ele à pasta privada. Para arquivos cadastrados fora do painel, o acesso direto segue as permissões do Drive. A troca de um arquivo mantém a versão anterior no Drive.
- Para atualizar o painel, publique uma nova versão dentro da implantação existente, preservando seu URL.
