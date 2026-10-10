import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.0"

const allowedOrigins=new Set([
  "https://fit.andreway.ru",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

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

Deno.serve(async req=>{
  const origin=req.headers.get("Origin")
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)})
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin)

  const url=Deno.env.get("SUPABASE_URL")||""
  const adminKey=getAdminKey()
  if(!url||!adminKey)return json({error:"Server auth is not configured"},500,origin)

  const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim()
  if(!bearer)return json({error:"Authentication required"},401,origin)

  let body:{client_id?:unknown}
  try{body=await req.json()}catch{return json({error:"Invalid request"},400,origin)}
  const clientId=typeof body.client_id==="string"?body.client_id.trim():""
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)){
    return json({error:"Invalid client"},400,origin)
  }

  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:auth,error:authError}=await admin.auth.getUser(bearer)
  if(authError||!auth.user)return json({error:"Authentication required"},401,origin)

  const {data,error}=await admin.rpc("create_client_telegram_link_token_service",{
    p_trainer_id:auth.user.id,
    p_client_id:clientId,
  })
  if(error){
    const forbidden=/trainer access|required|active client relationship/i.test(error.message)
    return json({error:forbidden?"Client access denied":"Unable to create Telegram link"},forbidden?403:500,origin)
  }

  const token=typeof data==="string"?data:""
  if(!token)return json({error:"Unable to create Telegram link"},500,origin)

  return json({token,expires_in_seconds:900},200,origin)
})
