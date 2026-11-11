# Implantação: Brain UJN 3.0 — IA Editorial

**Estado:** função deployada em HOMOLOGAÇÃO; integração do painel e WhatsApp ainda não foi ativada. Não mexer nos webhooks Meta/OJS nem nas funções Academy.

## 1. Supabase (já realizado)
Projeto: **UJN Intelligence Homologação** `leytqsyfrmzhectatcqm`.
Função: `ujn-ai-editorial-consult`.
Fonte: `supabase/functions/ujn-ai-editorial-consult/index.ts`.
Endpoint: `https://leytqsyfrmzhectatcqm.supabase.co/functions/v1/ujn-ai-editorial-consult`.
`verify_jwt=false` é proposital porque o JWT pertence ao OUTRO projeto (Academy): a função valida obrigatoriamente o Bearer no Academy Auth e confere titularidade da submissão no servidor. Não remova estas validações.

## 2. Painel GitHub Pages
Repositório: `peas8810/editora_ujn`; ramificação `brain-ujn-ia-v3-homologacao`.
Copie/import o arquivo `web/editorial-client.js` no projeto que realmente publica o painel no domínio `https://peas8810.github.io`. Antes de fazê-lo, identifique qual repositório está conectado ao deploy do painel. **Não copie para o cPanel sem criar um backend proxy autenticado**, pois o CORS só aceita o domínio GitHub Pages.

Exemplo de uso em uma área autenticada, sem criar novo formulário de login:

```javascript
import { consultarSituacaoEditorial } from "./editorial-client.js";
const { data: { session } } = await academySupabase.auth.getSession();
if (!session?.access_token) throw new Error("Faça login.");
const result = await consultarSituacaoEditorial({
  academyAccessToken: session.access_token,
  journal: "REMUNOM",
  submissionId: "123"
});
console.log(result.explanation, result.stale);
```

`academySupabase` no exemplo é a instância Supabase Auth **já existente** no painel, não uma variável criada por este pacote.

## 3. cPanel
**Nesta fase NÃO colocar arquivo em public_html, NÃO alterar cron, .htaccess, webhook, bot ou menus.** A função funciona no Supabase e é acessível por clientes autorizados. O cPanel só receberá um proxy (se necessário) após inspeção da estrutura real de produção, com autenticação e proteção CSRF.

## 4. Regras e limites
- Só retorna status ao titular autenticado e com vínculo `VERIFIED` em `public.ujn_lab_editorial_follow`.
- Lê o snapshot já mantido pelo conector OJS existente. Não força consulta na API OJS.
- Marca `stale=true` se a informação for antiga (>30 min) ou sem timestamp; não sugere status recente.
- Resposta é explicação estruturada **determinística**, não uma inferência generativa. A geração LLM do `ujn-brain-ai-insights` permanece separada até integração autenticada.
- Não envia WhatsApp, não cria cobranças, não aprova artigos ou documentos.
- Nenhuma chave secreta precisa ser copiada, compartilhada ou criada para este módulo.

## 5. Testes mínimos (usar identidade real Academy)
1. Sem token -> HTTP 401.
2. Token inválido -> HTTP 401.
3. Origem web diferente -> HTTP 403.
4. Autor logado com artigo não vinculado -> HTTP 403.
5. Autor vinculado, mas não verificado -> HTTP 403.
6. Autor com vínculo VERIFIED -> HTTP 200, apenas seu próprio protocolo.
7. Status desatualizado -> HTTP 200 com stale=true.
8. Inspecionar logs e não verificar nenhuma mensagem WhatsApp gerada.

## 6. Rollback
Como é uma função **nova e isolada**, basta retirar o import/chamada no painel. Não alterar `ujn-whatsapp`, `ujn-central`, `ujn-ojs-verified-status` nem as rotinas editoriais já existentes. Uma vez desligada a chamada, o atendimento atual permanece como antes.
