import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.0"

type TelegramUser={
  id:number
  first_name?:string
  last_name?:string
  username?:string
  language_code?:string
}

const encoder=new TextEncoder()
const allowedOrigins=new Set(["https://fit.andreway.ru","http://localhost:5173","http://127.0.0.1:5173"])

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

async function hmacSha256(key:Uint8Array,data:string){
  const cryptoKey=await crypto.subtle.importKey(
    "raw",
    key,
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,encoder.encode(data)))
}

function hex(bytes:Uint8Array){
  return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("")
}

function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false
  let diff=0
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i)
  return diff===0
}

function buildCheckString(params:URLSearchParams,excludeSignature:boolean){
  return [...params.entries()]
    .filter(([key])=>key!=="hash"&&(!excludeSignature||key!=="signature"))
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([key,value])=>`${key}=${value}`)
    .join("\n")
}

async function validateTelegramInitData(initData:string,botToken:string){
  const params=new URLSearchParams(initData)
  const receivedHash=params.get("hash")?.toLowerCase()||""
  if(!receivedHash)return {ok:false as const,reason:"missing_hash"}

  const secret=await hmacSha256(encoder.encode("WebAppData"),botToken)
  const primary=hex(await hmacSha256(secret,buildCheckString(params,false)))
  let valid=constantTimeEqual(primary,receivedHash)

  // Some Telegram clients include the newer third-party signature field.
  // Accept both documented hash layouts so the HMAC flow remains compatible.
  if(!valid&&params.has("signature")){
    const withoutSignature=hex(await hmacSha256(secret,buildCheckString(params,true)))
    valid=constantTimeEqual(withoutSignature,receivedHash)
  }
  if(!valid)return {ok:false as const,reason:"invalid_hash"}

  const authDate=Number(params.get("auth_date")||0)
  const now=Math.floor(Date.now()/1000)
  if(!Number.isFinite(authDate)||authDate<=0||authDate>now+60||now-authDate>3600){
    return {ok:false as const,reason:"stale"}
  }

  let user:TelegramUser|null=null
  try{
    const raw=params.get("user")
    user=raw?JSON.parse(raw) as TelegramUser:null
  }catch{}
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0){
    return {ok:false as const,reason:"missing_user"}
  }

  return {ok:true as const,user}
}

Deno.serve(async req=>{
  const origin=req.headers.get("Origin")
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)})
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin)

  const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN")||""
  const url=Deno.env.get("SUPABASE_URL")||""
  const adminKey=getAdminKey()
  if(!botToken)return json({error:"Telegram auth is not configured"},503,origin)
  if(!url||!adminKey)return json({error:"Server auth is not configured"},500,origin)

  let body:{init_data?:unknown}
  try{body=await req.json()}catch{return json({error:"Invalid request"},400,origin)}
  const initData=typeof body.init_data==="string"?body.init_data:""
  if(!initData||initData.length>8192)return json({error:"Telegram data required"},400,origin)

  const validation=await validateTelegramInitData(initData,botToken)
  if(!validation.ok)return json({error:"Telegram authentication failed"},401,origin)

  const telegramId=String(validation.user.id)
  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}})

  const {data:channels,error:channelError}=await admin
    .from("notification_channels")
    .select("client_id,enabled,verified_at")
    .eq("channel","telegram")
    .eq("external_id",telegramId)
    .limit(2)

  if(channelError)return json({error:"Unable to check Telegram binding"},500,origin)
  const verified=(channels||[]).filter(row=>row.enabled&&row.verified_at)
  if(verified.length===0){
    return json({
      status:"unlinked",
      telegram_user:{
        id:validation.user.id,
        first_name:validation.user.first_name||"",
        username:validation.user.username||"",
      },
    },200,origin)
  }
  if(verified.length>1)return json({error:"Telegram account has conflicting bindings"},409,origin)

  const profileId=verified[0].client_id
  const {data:profile,error:profileError}=await admin
    .from("profiles")
    .select("id,role")
    .eq("id",profileId)
    .maybeSingle()
  if(profileError||!profile)return json({error:"Linked profile not found"},404,origin)

  if(profile.role==="client"){
    const {data:coachLink,error:coachError}=await admin
      .from("coach_clients")
      .select("status")
      .eq("client_id",profileId)
      .order("started_at",{ascending:false})
      .limit(1)
      .maybeSingle()
    if(coachError)return json({error:"Unable to verify accompaniment status"},500,origin)
    if(coachLink?.status&&coachLink.status!=="active"){
      return json({status:"blocked",reason:coachLink.status},403,origin)
    }
  }

  const {data:authUser,error:userError}=await admin.auth.admin.getUserById(profileId)
  const email=authUser.user?.email||""
  if(userError||!email)return json({error:"Linked auth account not found"},404,origin)

  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email})
  const tokenHash=link?.properties?.hashed_token
  if(linkError||!tokenHash)return json({error:"Unable to create Telegram session"},500,origin)

  return json({status:"linked",token_hash:tokenHash,profile_id:profileId},200,origin)
})
