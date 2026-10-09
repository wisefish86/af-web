import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.0"

const allowedOrigins=new Set([
  "https://fit.andreway.ru",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])
const encoder=new TextEncoder()

function cors(origin:string|null){
  const value=origin&&allowedOrigins.has(origin)?origin:"https://fit.andreway.ru"
  return {
    "Access-Control-Allow-Origin":value,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin",
  }
}
function json(body:unknown,status=200,origin:string|null=null){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"},
  })
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
function base64Url(bytes:Uint8Array){
  let binary=""
  for(const byte of bytes)binary+=String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")
}
function randomToken(){
  return base64Url(crypto.getRandomValues(new Uint8Array(24)))
}
async function sha256Hex(value:string){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)))
  return [...digest].map(v=>v.toString(16).padStart(2,"0")).join("")
}
function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false
  let diff=0
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i)
  return diff===0
}
async function botApi(botToken:string,method:string,body:Record<string,unknown>={}){
  const response=await fetch("https://api.telegram.org/bot"+botToken+"/"+method,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),
  })
  let payload:any=null
  try{payload=await response.json()}catch{}
  if(!response.ok||!payload?.ok)throw new Error(String(payload?.description||("Telegram "+method+" failed")))
  return payload.result
}
async function webhookSecret(botToken:string){
  return await sha256Hex("andrey-fit:web-login:"+botToken)
}
async function ensureBot(botToken:string,supabaseUrl:string){
  const me=await botApi(botToken,"getMe")
  const username=String(me?.username||"").trim()
  if(!username)throw new Error("Telegram bot username unavailable")

  const webhookUrl=supabaseUrl.replace(/\/$/,"")+"/functions/v1/telegram-web-auth"
  const secret=await webhookSecret(botToken)
  const info=await botApi(botToken,"getWebhookInfo")
  if(String(info?.url||"")!==webhookUrl){
    await botApi(botToken,"setWebhook",{
      url:webhookUrl,
      secret_token:secret,
      allowed_updates:["message"],
      drop_pending_updates:false,
    })
  }

  try{
    await botApi(botToken,"setChatMenuButton",{menu_button:{type:"commands"}})
  }catch{}

  return {username}
}
async function generateSessionToken(admin:any,profileId:string){
  const {data:authUser,error:userError}=await admin.auth.admin.getUserById(profileId)
  const email=authUser.user?.email||""
  if(userError||!email)throw new Error("Linked auth account not found")
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email})
  const tokenHash=link?.properties?.hashed_token
  if(linkError||!tokenHash)throw new Error("Unable to create web session")
  return tokenHash
}
async function resolveLoginTarget(admin:any,telegramId:string){
  const {data:channels,error:channelError}=await admin
    .from("notification_channels")
    .select("client_id,enabled,verified_at")
    .eq("channel","telegram")
    .eq("external_id",telegramId)
    .limit(2)
  if(channelError)throw channelError

  const verified=(channels||[]).filter((row:any)=>row.enabled&&row.verified_at)
  if(verified.length===0)return {status:"unlinked" as const,profileId:null,reason:"telegram_not_linked"}
  if(verified.length>1)return {status:"error" as const,profileId:null,reason:"conflicting_bindings"}

  let targetId=String(verified[0].client_id||"")
  const {data:profile,error:profileError}=await admin.from("profiles").select("id,role").eq("id",targetId).maybeSingle()
  if(profileError||!profile)return {status:"error" as const,profileId:null,reason:"profile_not_found"}

  if(profile.role==="trainer"){
    const keys=["telegram_owner_trainer_id","telegram_owner_test_client_id"]
    const {data:settings,error:settingsError}=await admin.from("app_settings").select("key,value").in("key",keys)
    if(settingsError)return {status:"error" as const,profileId:null,reason:"owner_config_unavailable"}
    const map=new Map<string,string>((settings||[]).map((row:any)=>[String(row.key),String(row.value)]))
    if(targetId!==map.get("telegram_owner_trainer_id"))return {status:"blocked" as const,profileId:null,reason:"trainer_login_disabled"}
    targetId=map.get("telegram_owner_test_client_id")||""
  }

  const {data:target,error:targetError}=await admin.from("profiles").select("id,role").eq("id",targetId).maybeSingle()
  if(targetError||target?.role!=="client")return {status:"error" as const,profileId:null,reason:"client_profile_required"}

  const {data:coachLink,error:coachError}=await admin
    .from("coach_clients")
    .select("status")
    .eq("client_id",targetId)
    .order("started_at",{ascending:false})
    .limit(1)
    .maybeSingle()
  if(coachError)return {status:"error" as const,profileId:null,reason:"client_status_unavailable"}
  if(coachLink?.status!=="active")return {status:"blocked" as const,profileId:null,reason:String(coachLink?.status||"inactive")}

  return {status:"linked" as const,profileId:targetId,reason:null}
}
async function sendReturnMessage(botToken:string,chatId:string,token:string,status:string){
  const returnUrl="https://fit.andreway.ru/?tg_login="+encodeURIComponent(token)
  const text=status==="linked"
    ?"✅ Вход подтверждён. Вернись в Andrey-Fit."
    :status==="unlinked"
      ?"Этот Telegram пока не привязан к профилю Andrey-Fit."
      :status==="blocked"
        ?"Доступ к сопровождению сейчас закрыт."
        :"Не удалось подтвердить вход. Попробуй ещё раз."
  await botApi(botToken,"sendMessage",{
    chat_id:chatId,
    text,
    reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:returnUrl}]]},
  })
}
async function handleWebhook(req:Request,botToken:string,admin:any){
  const expected=await webhookSecret(botToken)
  const received=req.headers.get("X-Telegram-Bot-Api-Secret-Token")||""
  if(!received||!constantTimeEqual(received,expected))return new Response("forbidden",{status:403})

  let update:any
  try{update=await req.json()}catch{return new Response("ok")}
  const message=update?.message
  const chatId=String(message?.chat?.id??"")
  const telegramId=String(message?.from?.id??"")
  const text=String(message?.text||"").trim()
  if(!chatId||!telegramId||!text)return new Response("ok")

  const start=text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i)?.[1]?.trim()||""
  if(!start)return new Response("ok")

  if(start.startsWith("login_")){
    const token=start.slice(6)
    if(!/^[A-Za-z0-9_-]{20,60}$/.test(token))return new Response("ok")
    const tokenHash=await sha256Hex(token)
    const target=await resolveLoginTarget(admin,telegramId)
    const {data:resolved}=await admin.rpc("resolve_telegram_web_login_session_service",{
      p_token_hash:tokenHash,
      p_status:target.status,
      p_profile_id:target.profileId,
      p_telegram_id:telegramId,
      p_reason:target.reason,
    })
    if(resolved)await sendReturnMessage(botToken,chatId,token,target.status)
    else await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Ссылка входа устарела. Открой Andrey-Fit и начни вход ещё раз."})
    return new Response("ok")
  }

  if(start.startsWith("link_")){
    const linkToken=start.slice(5)
    const {data:clientId,error}=await admin.rpc("consume_client_telegram_link_token_service",{
      p_token:linkToken,
      p_telegram_id:telegramId,
      p_metadata:{
        telegram_username:message?.from?.username||null,
        telegram_first_name:message?.from?.first_name||null,
        source:"bot_start",
      },
    })
    if(error||!clientId){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Ссылка подключения устарела или уже использована. Вернись в Andrey-Fit и нажми «Подключить Telegram» ещё раз."})
      return new Response("ok")
    }
    await botApi(botToken,"sendMessage",{
      chat_id:chatId,
      text:"✅ Telegram подключён к Andrey-Fit. Уведомления от бота включены. Вернись в приложение.",
      reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:"https://fit.andreway.ru/"}]]},
    })
    return new Response("ok")
  }

  return new Response("ok")
}

Deno.serve(async req=>{
  const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN")||""
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||""
  const adminKey=getAdminKey()
  if(!botToken||!supabaseUrl||!adminKey)return json({enabled:false,error:"Telegram login server is not configured"},503,req.headers.get("Origin"))

  const admin=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}})

  if(req.headers.has("X-Telegram-Bot-Api-Secret-Token")){
    try{return await handleWebhook(req,botToken,admin)}
    catch(error){
      console.error("telegram login webhook failed",error instanceof Error?error.message:String(error))
      return new Response("ok")
    }
  }

  const origin=req.headers.get("Origin")
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)})
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin)
  if(!origin||!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin)

  let body:{action?:unknown;token?:unknown}
  try{body=await req.json()}catch{return json({error:"Invalid request"},400,origin)}
  const action=String(body.action||"availability")

  if(action==="availability"){
    try{
      const bot=await ensureBot(botToken,supabaseUrl)
      return json({enabled:true,bot_username:bot.username},200,origin)
    }catch(error){
      console.error("telegram login availability failed",error instanceof Error?error.message:String(error))
      return json({enabled:false,error:"Telegram bot is unavailable"},200,origin)
    }
  }

  if(action==="begin"){
    try{
      const bot=await ensureBot(botToken,supabaseUrl)
      const token=randomToken()
      const tokenHash=await sha256Hex(token)
      const {error}=await admin.rpc("create_telegram_web_login_session_service",{p_token_hash:tokenHash})
      if(error)throw error
      return json({
        enabled:true,
        token,
        bot_url:"https://t.me/"+bot.username+"?start="+encodeURIComponent("login_"+token),
        expires_in_seconds:600,
      },200,origin)
    }catch(error){
      console.error("telegram login begin failed",error instanceof Error?error.message:String(error))
      return json({error:"Не удалось начать вход через Telegram."},500,origin)
    }
  }

  if(action==="status"){
    const token=typeof body.token==="string"?body.token.trim():""
    if(!/^[A-Za-z0-9_-]{20,60}$/.test(token))return json({error:"Некорректная ссылка входа."},400,origin)
    const tokenHash=await sha256Hex(token)
    const {data:rows,error}=await admin.rpc("read_telegram_web_login_session_service",{p_token_hash:tokenHash})
    if(error)return json({error:"Не удалось проверить вход через Telegram."},500,origin)
    const session=Array.isArray(rows)?rows[0]:rows
    if(!session)return json({error:"Сессия входа не найдена. Начни вход ещё раз."},404,origin)
    if(session.consumed_at)return json({error:"Эта ссылка входа уже использована."},410,origin)
    if(new Date(session.expires_at).getTime()<=Date.now())return json({error:"Ссылка входа истекла. Начни вход ещё раз."},410,origin)
    if(session.status==="pending")return json({status:"pending"},200,origin)
    if(session.status==="unlinked")return json({status:"unlinked",reason:session.reason},200,origin)
    if(session.status==="blocked")return json({status:"blocked",reason:session.reason},200,origin)
    if(session.status!=="linked"||!session.profile_id)return json({status:"error",error:"Не удалось подтвердить Telegram."},200,origin)

    let tokenHashSession:string
    try{tokenHashSession=await generateSessionToken(admin,String(session.profile_id))}
    catch(error){
      console.error("telegram session generation failed",error instanceof Error?error.message:String(error))
      return json({error:"Не удалось создать сессию Andrey-Fit."},500,origin)
    }

    const {data:consumed,error:consumeError}=await admin.rpc("consume_telegram_web_login_session_service",{p_token_hash:tokenHash})
    if(consumeError||!consumed)return json({error:"Сессия входа уже использована. Начни вход ещё раз."},409,origin)

    return json({status:"linked",token_hash:tokenHashSession,profile_id:session.profile_id},200,origin)
  }

  return json({error:"Unknown action"},400,origin)
})
