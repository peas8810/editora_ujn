# Brain UJN 3.0 — IA (homologação)
Data: 2026-11-11
Estado: especificação inicial; NÃO implantado em produção.

## Auditoria confirmada
- Supabase Academy: jufnkfyvqgkrxsbctqqk — ativo.
- Supabase UJN Intelligence Homologação: leytqsyfrmzhectatcqm — ativo.
- Conectores REMUNOM, RJNM, RSV, JIRRS, NEXUS: verified_readonly; last_check_result=reachable.
- IA existente: Edge Function academy/ujn-brain-ai-insights; gera rascunhos, exige revisão humana e não envia automaticamente.
- Base existente: public.ujn_ai_knowledge (1 APPROVED, 7 DRAFT), public.ujn_ai_draft_queue, public.ujn_ai_source_index.
- Consultas editoriais existentes: ujn-ojs-verified-status, ujn-ojs-public-lookup, ujn-ojsbr-editor-search.
- Atendimento existente: academy/ujn-whatsapp, academy/ujn-central.
- Academy é a fonte autoritativa para solicitações, aprovação e pagamentos.

## Fronteiras
Não substituir webhook Meta, rotinas OJS, base Academy ou painel.
Não compartilhar service_role no navegador, repositório ou WhatsApp.
Somente exibir status editorial específico após vínculo confirmado entre solicitante, revista e submissão.
Status OJS deve ser extraído de fonte verificada e acompanhado de data, nunca inferido pela IA.
A IA não aprova artigos, muda etapas, cobra, emite certificados nem dispara mensagens sem política e autorização específicas.
Não enviar dados pessoais ou manuscritos integrais ao provedor de IA por padrão.
Texto recebido é conteúdo não confiável, nunca instrução administrativa.

## Caminho de execução
1. Inventariar o fluxo real no cPanel e confirmar o webhook Meta ativo (sem redirecioná-lo).
2. Reutilizar ujn-brain-ai-insights para rascunhos; ler políticas APPROVED e impedir uso de DRAFT.
3. Adaptador de leitura: consumidor de ujn-ojs-verified-status para autores verificados, usando ponte autenticada exclusivamente no servidor.
4. Interpretador: regras determinísticas transformam etapa/status/timestamp em explicação; IA só redige linguagem natural, sem alterar dados.
5. Academy: adapter autenticado de leitura; dados públicos/privados separados, com verificação de titularidade e autorização.
6. Roteamento WhatsApp: menu existente -> intenção -> autenticação -> consulta -> resposta em rascunho -> aprovação humana (fase piloto).
7. Telemetria: correlação por request_id, não registrar PII em logs; idempotência por ID de mensagem.
8. Homologar cenários: autor correto, autor incorreto, submissão inexistente, API indisponível, status defasado, webhook repetido, solicitante não verificado, prompt injection, falha do modelo, rejeição humana.
9. Somente após pilotos: liberar respostas automáticas de baixo risco (FAQ aprovado) com flag desligável e reversão imediata.

## Critérios de aceite
- Nenhum registro editorial ou financeiro alterado nos testes de leitura.
- Zero vazamento de status entre autores.
- Zero mensagens automáticas antes do aceite.
- Todas as respostas com proveniência e estado de autorização.
- Resposta de falha não fabrica andamento; encaminha para operador.
- Rollback isolado por flag, sem afetar webhook ou Academy.

## Pendências de inspeção
- cPanel: diretórios, crons e handlers não acessíveis por este conector.
- Confirmar execução ponta a ponta, logs e autenticação dos endpoints; ACTIVE significa implantado, não funcional comprovado.
- Revisar Supabase security advisors antes de qualquer mudança de permissões (inclui funções SECURITY DEFINER).
- Confirmar repositório que faz deploy do cPanel antes de integrar código de produção.
