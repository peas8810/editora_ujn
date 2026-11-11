/**
 * Brain UJN IA 3.0 — adaptador do painel em https://peas8810.github.io
 * Requer JWT do usuário LOGADO no Academy Supabase Auth.
 * Não use service_role, nem chaves OJS, nem tokens Meta no navegador.
 * Não envia mensagens WhatsApp e não cria vínculo de autoria.
 */
export async function consultarSituacaoEditorial({academyAccessToken,journal,submissionId}) {
  if(typeof academyAccessToken!=="string"||!academyAccessToken.trim()) throw new Error("Entre na sua conta Academy.");
  const response=await fetch("https://leytqsyfrmzhectatcqm.supabase.co/functions/v1/ujn-ai-editorial-consult",{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+academyAccessToken},
    body:JSON.stringify({action:"explain_status",journal,submission_id:String(submissionId)}),
  });
  const data=await response.json().catch(()=>({error:"invalid_server_response"}));
  if(!response.ok) {
    if(response.status===401) throw new Error("Faça login no Academy para consultar.");
    if(response.status===403) throw new Error("A autoria deste manuscrito precisa ser verificada antes da consulta.");
    throw new Error("Consulta indisponível no momento. Não é possível confirmar o andamento.");
  }
  return data; // explanation, stage, status, checked_at, stale
}
