# Publicação de obras da Editora UJN

A planilha editorial é a fonte do catálogo. Cadastre a obra e envie os arquivos pela área administrativa. Selecione **Publicado** e confirme a autorização quando a ficha estiver pronta. Para retirar uma obra do catálogo, altere a situação para **Rascunho** no painel.

Cada edição ou formato publicado usa seu ISBN na URL, no formato `https://publisherujn.com/editora/livro/?isbn=ISBN13`. A página apresenta o botão de consulta oficial quando esse link está preenchido na planilha. Use a aba Registros complementares para DOI, ISSN de coleção e outros registros.

O site lê apenas `editora/obras.json`, que contém os dados publicados. O conversor `sync-catalog.mjs` recebe no stdin um JSON com as matrizes `books` e `records` da planilha, ambas com cabeçalhos na primeira linha. O conversor imprime o catálogo no stdout e os avisos no stderr. Endereços do site anotados na planilha são informativos. O site deriva o endereço do ISBN validado.
