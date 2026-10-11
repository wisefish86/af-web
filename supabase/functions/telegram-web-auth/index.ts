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
function internalPassword(){
  const bytes=crypto.getRandomValues(new Uint8Array(24))
  return base64Url(bytes)+"Aa7!"
}
async function createDirectLoginReturn(admin:any,profileId:string,telegramId:string){
  const token=randomToken()
  const tokenHash=await sha256Hex(token)
  const {error:createError}=await admin.rpc("create_telegram_web_login_session_service",{p_token_hash:tokenHash,p_requested_role:"client"})
  if(createError)throw createError
  const {data:resolved,error:resolveError}=await admin.rpc("resolve_telegram_web_login_session_service",{
    p_token_hash:tokenHash,
    p_status:"linked",
    p_profile_id:profileId,
    p_telegram_id:telegramId,
    p_reason:null,
  })
  if(resolveError||!resolved)throw resolveError??new Error("Unable to prepare direct login")
  return token
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
async function resolveLoginTarget(admin:any,telegramId:string,requestedRole:"client"|"trainer"){
  const {data:channels,error:channelError}=await admin
    .from("notification_channels")
    .select("client_id,enabled,verified_at")
    .eq("channel","telegram")
    .eq("external_id",telegramId)
    .limit(10)
  if(channelError)throw channelError

  const ids=(channels||[])
    .filter((row:any)=>row.enabled&&row.verified_at)
    .map((row:any)=>String(row.client_id||""))
    .filter(Boolean)
  if(ids.length===0)return {status:"unlinked" as const,profileId:null,reason:"telegram_not_linked"}

  const {data:profiles,error:profilesError}=await admin
    .from("profiles")
    .select("id,role")
    .in("id",ids)
  if(profilesError)throw profilesError

  const matches=(profiles||[]).filter((row:any)=>row.role===requestedRole)
  if(matches.length===0)return {status:"unlinked" as const,profileId:null,reason:requestedRole+"_telegram_not_linked"}
  if(matches.length>1)return {status:"error" as const,profileId:null,reason:"ambiguous_"+requestedRole+"_binding"}

  const targetId=String(matches[0].id)
  if(requestedRole==="trainer")return {status:"linked" as const,profileId:targetId,reason:null}

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
async function sendReturnMessage(botToken:string,chatId:string,token:string,status:string,role:"client"|"trainer"){
  const returnUrl=role==="trainer"
    ?"https://fit.andreway.ru/?app=trainer&tg_login="+encodeURIComponent(token)+"#/trainer-access"
    :"https://fit.andreway.ru/?tg_login="+encodeURIComponent(token)
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

  const connect=text.match(/^\/connect(?:@\w+)?\s+([0-9a-f]{36})$/i)?.[1]?.trim()||""
  if(connect){
    const {data:clientId,error}=await admin.rpc("consume_client_telegram_link_token_service",{
      p_token:connect,
      p_telegram_id:telegramId,
      p_metadata:{
        telegram_username:message?.from?.username||null,
        telegram_first_name:message?.from?.first_name||null,
        source:"bot_connect_command",
      },
    })
    if(error||!clientId){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Код подключения устарел или уже использован. Вернись в Andrey-Fit и создай новый код."})
      return new Response("ok")
    }
    await botApi(botToken,"sendMessage",{
      chat_id:chatId,
      text:"✅ Telegram подключён к Andrey-Fit. Уведомления от бота включены. Вернись в приложение.",
      reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:"https://fit.andreway.ru/"}]]},
    })
    return new Response("ok")
  }

  const start=text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i)?.[1]?.trim()||""
  if(!start)return new Response("ok")

  if(start.startsWith("invite_")){
    const inviteToken=start.slice(7)
    if(!/^[A-Za-z0-9_-]{20,60}$/.test(inviteToken))return new Response("ok")
    const tokenHash=await sha256Hex(inviteToken)
    const {data:invite,error:inviteError}=await admin.from("client_invites")
      .select("coach_id,accepted_at,accepted_by,revoked_at,expires_at")
      .eq("token_hash",tokenHash)
      .maybeSingle()
    if(inviteError||!invite){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Приглашение не найдено. Попроси тренера прислать новую ссылку."})
      return new Response("ok")
    }
    if(invite.revoked_at||new Date(invite.expires_at).getTime()<=Date.now()){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Срок приглашения истёк. Попроси тренера прислать новую ссылку."})
      return new Response("ok")
    }

    if(invite.accepted_at&&invite.accepted_by){
      const {data:existingChannel}=await admin.from("notification_channels")
        .select("client_id")
        .eq("client_id",invite.accepted_by)
        .eq("channel","telegram")
        .eq("external_id",telegramId)
        .eq("enabled",true)
        .not("verified_at","is",null)
        .maybeSingle()
      if(existingChannel){
        try{
          const loginToken=await createDirectLoginReturn(admin,String(invite.accepted_by),telegramId)
          await sendReturnMessage(botToken,chatId,loginToken,"linked","client")
        }catch{
          await botApi(botToken,"sendMessage",{chat_id:chatId,text:"✅ Приглашение уже принято. Открой Andrey-Fit и войди через Telegram.",reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:"https://fit.andreway.ru/"}]]}})
        }
      }else{
        await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Эта ссылка уже использована. Попроси тренера прислать новую."})
      }
      return new Response("ok")
    }

    const {data:telegramBindings,error:bindingError}=await admin.from("notification_channels")
      .select("client_id")
      .eq("channel","telegram")
      .eq("external_id",telegramId)
      .eq("enabled",true)
      .not("verified_at","is",null)
      .limit(2)
    if(bindingError)throw bindingError
    if((telegramBindings||[]).length>0){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Этот Telegram уже связан с другим профилем Andrey-Fit. Если нужен перенос — напиши тренеру."})
      return new Response("ok")
    }

    const firstName=String(message?.from?.first_name||"").trim().slice(0,60)
    const email="tg-invite-"+crypto.randomUUID()+"@users.andreway.ru"
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,
      password:internalPassword(),
      email_confirm:true,
      user_metadata:{display_name:firstName||"Новый клиент"},
    })
    if(createError||!created.user){
      await botApi(botToken,"sendMessage",{chat_id:chatId,text:"Не удалось создать кабинет. Попробуй ещё раз или попроси тренера обновить приглашение."})
      return new Response("ok")
    }

    const clientId=created.user.id
    try{
      const {error:profileError}=await admin.from("profiles").update({
        display_name:firstName||"Новый клиент",
        login_alias:null,
        nickname:null,
        age:null,
        must_set_password:true,
        updated_at:new Date().toISOString(),
      }).eq("id",clientId)
      if(profileError)throw profileError

      const {error:acceptError}=await admin.rpc("accept_client_telegram_invite_service",{
        p_token_hash:tokenHash,
        p_client_id:clientId,
        p_telegram_id:telegramId,
        p_metadata:{
          telegram_username:message?.from?.username||null,
          telegram_first_name:firstName||null,
          source:"trainer_invite",
        },
      })
      if(acceptError)throw acceptError
    }catch(error){
      const message=error instanceof Error?error.message:String(error)
      console.error("telegram invite acceptance failed",message)
      await admin.auth.admin.deleteUser(clientId).catch(()=>undefined)
      const alreadyUsed=/already been used|already used|уже использован/i.test(message)
      await botApi(botToken,"sendMessage",{
        chat_id:chatId,
        text:alreadyUsed
          ?"Эта ссылка уже использована. Попроси тренера прислать новую."
          :"Не удалось принять приглашение из-за технической ошибки. Ссылка не использована — попробуй ещё раз через минуту. Если ошибка повторится, сообщи тренеру.",
      })
      return new Response("ok")
    }

    try{
      const loginToken=await createDirectLoginReturn(admin,clientId,telegramId)
      await botApi(botToken,"sendMessage",{
        chat_id:chatId,
        text:"✅ Готово. Кабинет создан — осталось указать имя и пару данных о себе.",
        reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:"https://fit.andreway.ru/?tg_login="+encodeURIComponent(loginToken)}]]},
      })
    }catch{
      await botApi(botToken,"sendMessage",{
        chat_id:chatId,
        text:"✅ Кабинет создан. Открой Andrey-Fit и войди через Telegram.",
        reply_markup:{inline_keyboard:[[{text:"Открыть Andrey-Fit",url:"https://fit.andreway.ru/"}]]},
      })
    }
    return new Response("ok")
  }

  if(start.startsWith("login_")){
    const token=start.slice(6)
    if(!/^[A-Za-z0-9_-]{20,60}$/.test(token))return new Response("ok")
    const tokenHash=await sha256Hex(token)
    const {data:sessionRows}=await admin.rpc("read_telegram_web_login_session_service",{p_token_hash:tokenHash})
    const loginSession=Array.isArray(sessionRows)?sessionRows[0]:sessionRows
    const requestedRole=loginSession?.requested_role==="trainer"?"trainer":"client"
    const target=await resolveLoginTarget(admin,telegramId,requestedRole)
    const {data:resolved}=await admin.rpc("resolve_telegram_web_login_session_service",{
      p_token_hash:tokenHash,
      p_status:target.status,
      p_profile_id:target.profileId,
      p_telegram_id:telegramId,
      p_reason:target.reason,
    })
    if(resolved)await sendReturnMessage(botToken,chatId,token,target.status,requestedRole)
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

  let body:{action?:unknown;token?:unknown;role?:unknown}
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
      const role=body.role==="trainer"?"trainer":"client"
      const token=randomToken()
      const tokenHash=await sha256Hex(token)
      const {error}=await admin.rpc("create_telegram_web_login_session_service",{p_token_hash:tokenHash,p_requested_role:role})
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

    return json({status:"linked",token_hash:tokenHashSession,profile_id:session.profile_id,role:session.requested_role},200,origin)
  }

  return json({error:"Unknown action"},400,origin)
})
