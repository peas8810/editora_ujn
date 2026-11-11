// Brain UJN 3.0 — consulta editorial com identidade Academy.
// Implantação isolada no projeto UJN Intelligence Homologação.
// Não envia mensagens, não consulta manuscritos não vinculados, não altera OJS.
const LAB = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ACADEMY = "https://jufnkfyvqgkrxsbctqqk.supabase.co";
const ACADEMY_PUB = "sb_publishable_Gw7GOqQKaGan1a-RnvHDhw_ePj9JLYY";
const ALLOWED_ORIGIN = "https://peas8810.github.io";
const JOURNALS = new Set(["REMUNOM","RJNM","RSV","JIRRS","NEXUS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const H = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","access-control-allow-origin":ALLOWED_ORIGIN,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type, apikey","vary":"Origin"};
const reply = (status:number, data:unknown) => new Response(JSON.stringify(data),{status,headers:H});
const statusLabel: Record<number,string> = {1:"Submissão",3:"Avaliação por pares",4:"Editoração",5:"Produção"};
function summary(journal:string, submission:string, stage:number|null, status:string|null, checked:string|null) {
  const stageText = stage === null ? "etapa não informada" : statusLabel[stage] || "etapa "+stage;
  const s = status ? " O status registrado é: "+status+"." : " O OJS não forneceu descrição detalhada do status.";
  const when = checked ? " Última verificação registrada: "+new Date(checked).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})+"." : " Não há data de verificação disponível.";
  return "Na revista "+journal+", o manuscrito "+submission+" consta na etapa de "+stageText+"."+s+when+" Essa informação não representa decisão editorial nem previsão de publicação.";
}
async function academyIdentity(jwt:string) {
  const r=await fetch(ACADEMY+"/auth/v1/user",{headers:{"apikey":ACADEMY_PUB,"authorization":"Bearer "+jwt},redirect:"error",signal:AbortSignal.timeout(7000)}).catch(()=>null);
  if(!r?.ok) return null;
  const u=await r.json().catch(()=>null);
  return UUID.test(u?.id||"") && !u?.is_anonymous ? u.id as string : null;
}
async function db(path:string) {
  if(!LAB||!SERVICE) throw Error("backend_unavailable");
  const r=await fetch(LAB+"/rest/v1/"+path,{headers:{"apikey":SERVICE,"authorization":"Bearer "+SERVICE},redirect:"error",signal:AbortSignal.timeout(7000)});
  if(!r.ok) throw Error("database_unavailable");
  return await r.json();
}
Deno.serve(async (req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin && origin!==ALLOWED_ORIGIN) return reply(403,{error:"origin_not_allowed"});
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:H});
  if(req.method!=="POST") return reply(405,{error:"method_not_allowed"});
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth) || auth.length>5000) return reply(401,{error:"academy_login_required"});
  const user=await academyIdentity(auth.slice(7));
  if(!user) return reply(401,{error:"academy_login_required"});
  if(Number(req.headers.get("content-length")||"0")>1500) return reply(413,{error:"payload_too_large"});
  let body:any;
  try { const raw=await req.text(); if(raw.length>1500) return reply(413,{error:"payload_too_large"}); body=JSON.parse(raw); }
  catch {return reply(400,{error:"invalid_json"});}
  if(body?.action!=="explain_status" || !JOURNALS.has(body?.journal) || !/^[1-9][0-9]{0,8}$/.test(String(body?.submission_id??""))) return reply(422,{error:"invalid_request"});
  const journal=body.journal as string, submission=String(body.submission_id);
  try {
    const rows=await db("ujn_lab_editorial_follow?select=state,last_stage_id,last_status,last_checked_at&user_id=eq."+encodeURIComponent(user)+"&journal_code=eq."+journal+"&submission_id=eq."+submission+"&limit=1");
    if(!Array.isArray(rows)||rows.length!==1||rows[0].state!=="VERIFIED") return reply(403,{error:"ownership_verification_required",hint:"Solicite a vinculação e a verificação da autoria antes de consultar."});
    const row=rows[0];
    const stage=Number.isInteger(row.last_stage_id)?row.last_stage_id:null;
    const status=typeof row.last_status==="string"?row.last_status.slice(0,90):null;
    const checked=typeof row.last_checked_at==="string"&&!Number.isNaN(Date.parse(row.last_checked_at))?row.last_checked_at:null;
    const stale=!checked || Date.now()-Date.parse(checked)>30*60*1000;
    return reply(200,{ok:true,mode:"readonly",source:"verified_ojs_snapshot",journal,submission_id:submission,stage_id:stage,stage:stage===null?null:statusLabel[stage]||"Etapa "+stage,status,checked_at:checked,stale,explanation:summary(journal,submission,stage,status,checked),needs_human_review:stale,automated_message_sent:false});
  }catch{return reply(503,{error:"editorial_lookup_unavailable",automated_message_sent:false});}
});
