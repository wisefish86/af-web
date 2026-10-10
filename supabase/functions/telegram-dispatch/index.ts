import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.0"

type Delivery={
  delivery_id:string
  recipient_id:string
  client_id:string
  title:string|null
  body:string|null
  action_path:string|null
  payload:Record<string,unknown>|null
  external_id:string
  recipient_role:string
  client_name:string|null
  attempt_count:number
}

function getAdminKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS")
  if(modern){
    try{
      const parsed=JSON.parse(modern) as Record<string,string>
      if(parsed.default)return parsed.default
    }catch{}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""
}

function safeText(value:string|null|undefined,max:number){
  const text=(value||"").trim()
  return text.length>max?text.slice(0,max-1)+"…":text
}

function actionUrl(path:string|null){
  const clean=(path||"/").startsWith("/")?(path||"/"):"/"+(path||"")
  return "https://fit.andreway.ru/#"+clean
}

async function sendTelegram(botToken:string,item:Delivery){
  const title=safeText(item.title,120)||"Andrey-Fit"
  const body=safeText(item.body,900)
  const client=item.client_name?.trim()
  const text=[
    item.recipient_role==="trainer"?"💬 "+title:"🔔 "+title,
    item.recipient_role==="trainer"&&client?"Клиент: "+client:"",
    body,
  ].filter(Boolean).join("\n\n")

  const button={
    text:item.recipient_role==="trainer"?"Открыть в кабинете":"Открыть Andrey-Fit",
    url:actionUrl(item.action_path),
  }

  const response=await fetch("https://api.telegram.org/bot"+botToken+"/sendMessage",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      chat_id:item.external_id,
      text,
      disable_web_page_preview:true,
      reply_markup:{inline_keyboard:[[button]]},
    }),
  })

  let payload:any=null
  try{payload=await response.json()}catch{}
  if(response.ok&&payload?.ok){
    return {ok:true as const,messageId:String(payload.result?.message_id||"")}
  }

  const description=String(payload?.description||("HTTP "+response.status))
  const retryAfter=Number(payload?.parameters?.retry_after||0)
  return {ok:false as const,error:description,retryAfter:Number.isFinite(retryAfter)?retryAfter:0}
}

Deno.serve(async req=>{
  if(req.method!=="POST"&&req.method!=="GET")return new Response("Method not allowed",{status:405})

  const url=Deno.env.get("SUPABASE_URL")||""
  const adminKey=getAdminKey()
  const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN")||""
  if(!url||!adminKey||!botToken){
    return new Response(JSON.stringify({error:"Dispatcher is not configured"}),{
      status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    })
  }

  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await admin.rpc("claim_due_telegram_deliveries",{p_limit:20})
  if(error){
    console.error("claim failed",error.message)
    return new Response(JSON.stringify({error:"Unable to claim Telegram deliveries"}),{
      status:500,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    })
  }

  const deliveries=(data||[]) as Delivery[]
  let sent=0
  let retried=0
  let failed=0

  for(const item of deliveries){
    try{
      const result=await sendTelegram(botToken,item)
      const {error:finishError}=await admin.rpc("finish_telegram_delivery",{
        p_id:item.delivery_id,
        p_success:result.ok,
        p_provider_message_id:result.ok?result.messageId:null,
        p_error:result.ok?null:result.error,
        p_retry_after_seconds:result.ok?0:result.retryAfter,
      })
      if(finishError)console.error("finish failed",item.delivery_id,finishError.message)
      if(result.ok)sent+=1
      else if(item.attempt_count>=4)failed+=1
      else retried+=1
    }catch(error){
      const message=error instanceof Error?error.message:"Telegram send failed"
      const {error:finishError}=await admin.rpc("finish_telegram_delivery",{
        p_id:item.delivery_id,
        p_success:false,
        p_provider_message_id:null,
        p_error:message,
        p_retry_after_seconds:0,
      })
      if(finishError)console.error("finish failed",item.delivery_id,finishError.message)
      if(item.attempt_count>=4)failed+=1
      else retried+=1
    }
  }

  return new Response(JSON.stringify({claimed:deliveries.length,sent,retried,failed}),{
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
  })
})
