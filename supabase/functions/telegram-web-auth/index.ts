import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.0"
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6"

const encoder=new TextEncoder()
const JWKS=createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"))
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
async function hmacHex(key:string,data:string){
  const cryptoKey=await crypto.subtle.importKey(
    "raw",encoder.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"],
  )
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,encoder.encode(data)))
  return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("")
}
function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false
  let diff=0
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i)
  return diff===0
}
async function makeNonce(secret:string){
  const ts=Math.floor(Date.now()/1000)
  const random=crypto.getRandomValues(new Uint8Array(16))
  const randomHex=[...random].map(v=>v.toString(16).padStart(2,"0")).join("")
  const payload="v1."+ts+"."+randomHex
  return payload+"."+await hmacHex(secret,payload)
}
async function verifyNonce(secret:string,nonce:string){
  const parts=nonce.split(".")
  if(parts.length!==4||parts[0]!=="v1")return false
  const ts=Number(parts[1])
  if(!Number.isFinite(ts))return false
  const now=Math.floor(Date.now()/1000)
  if(ts>now+60||now-ts>600)return false
  const payload=parts.slice(0,3).join(".")
  const expected=await hmacHex(secret,payload)
  return constantTimeEqual(expected,parts[3].toLowerCase())
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

Deno.serve(async req=>{
  const origin=req.headers.get("Origin")
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)})
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin)

  const clientId=(Deno.env.get("TELEGRAM_LOGIN_CLIENT_ID")||"").trim()
  const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN")||""
  const url=Deno.env.get("SUPABASE_URL")||""
  const adminKey=getAdminKey()

  let body:{action?:unknown;id_token?:unknown;nonce?:unknown}
  try{body=await req.json()}catch{return json({error:"Invalid request"},400,origin)}
  const action=String(body.action||"init")

  if(action==="init"){
    if(!clientId||!botToken)return json({enabled:false},200,origin)
    return json({enabled:true,client_id:clientId,nonce:await makeNonce(botToken)},200,origin)
  }

  if(action!=="complete")return json({error:"Unknown action"},400,origin)
  if(!clientId||!botToken||!url||!adminKey)return json({error:"Telegram web login is not configured"},503,origin)

  const idToken=typeof body.id_token==="string"?body.id_token:""
  const nonce=typeof body.nonce==="string"?body.nonce:""
  if(!idToken||!nonce)return json({error:"Telegram login data required"},400,origin)
  if(!await verifyNonce(botToken,nonce))return json({error:"Telegram login request expired"},401,origin)

  let payload:any
  try{
    const verified=await jwtVerify(idToken,JWKS,{
      issuer:"https://oauth.telegram.org",
      audience:clientId,
    })
    payload=verified.payload
  }catch{
    return json({error:"Telegram identity verification failed"},401,origin)
  }
  if(payload.nonce!==nonce)return json({error:"Telegram login nonce mismatch"},401,origin)

  const telegramId=String(payload.id??"").trim()
  if(!/^\d+$/.test(telegramId))return json({error:"Telegram user id missing"},401,origin)

  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:channels,error:channelError}=await admin
    .from("notification_channels")
    .select("client_id,enabled,verified_at")
    .eq("channel","telegram")
    .eq("external_id",telegramId)
    .limit(2)
  if(channelError)return json({error:"Unable to check Telegram binding"},500,origin)
  const verifiedChannels=(channels||[]).filter(row=>row.enabled&&row.verified_at)
  if(verifiedChannels.length===0)return json({status:"unlinked"},403,origin)
  if(verifiedChannels.length>1)return json({error:"Telegram account has conflicting bindings"},409,origin)

  let targetId=verifiedChannels[0].client_id
  let testOwner=false

  const {data:profile,error:profileError}=await admin
    .from("profiles")
    .select("id,role")
    .eq("id",targetId)
    .maybeSingle()
  if(profileError||!profile)return json({error:"Linked profile not found"},404,origin)

  if(profile.role==="trainer"){
    const keys=["telegram_owner_trainer_id","telegram_owner_test_client_id"]
    const {data:settings,error:settingsError}=await admin.from("app_settings").select("key,value").in("key",keys)
    if(settingsError)return json({error:"Unable to verify owner test account"},500,origin)
    const map=new Map<string,string>((settings||[]).map((row:any)=>[String(row.key),String(row.value)]))
    if(targetId!==map.get("telegram_owner_trainer_id"))return json({error:"Trainer web login through Telegram is disabled"},403,origin)
    targetId=map.get("telegram_owner_test_client_id")||""
    testOwner=true
  }

  const {data:target,error:targetError}=await admin
    .from("profiles")
    .select("id,role")
    .eq("id",targetId)
    .maybeSingle()
  if(targetError||target?.role!=="client")return json({error:"Client profile required"},403,origin)

  const {data:coachLink,error:coachError}=await admin
    .from("coach_clients")
    .select("status")
    .eq("client_id",targetId)
    .order("started_at",{ascending:false})
    .limit(1)
    .maybeSingle()
  if(coachError)return json({error:"Unable to verify accompaniment status"},500,origin)
  if(coachLink?.status!=="active")return json({status:"blocked",reason:coachLink?.status||"inactive"},403,origin)

  let tokenHash:string
  try{tokenHash=await generateSessionToken(admin,targetId)}
  catch(error){return json({error:error instanceof Error?error.message:"Unable to create web session"},500,origin)}

  return json({
    status:"linked",
    token_hash:tokenHash,
    profile_id:targetId,
    test_owner:testOwner,
  },200,origin)
})
