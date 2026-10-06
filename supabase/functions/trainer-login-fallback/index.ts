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
    "Access-Control-Allow-Headers":"content-type, apikey, x-client-info",
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

Deno.serve(async req=>{
  const origin=req.headers.get("Origin")
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)})
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin)
  if(!origin||!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin)

  let body:{email?:unknown;password?:unknown}
  try{body=await req.json()}catch{return json({error:"Invalid request"},400,origin)}
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():""
  const password=typeof body.password==="string"?body.password:""
  if(!email||!password||email.length>254||password.length>512)return json({error:"Некорректные данные входа."},400,origin)

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||""
  const publishableKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||""
  if(!supabaseUrl||!publishableKey)return json({error:"Сервер входа не настроен."},503,origin)

  const client=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}})
  try{
    const {data,error}=await client.auth.signInWithPassword({email,password})
    if(error||!data.session||!data.user){
      const invalid=error?.status===400||/invalid login credentials/i.test(error?.message||"")
      return json({error:invalid?"Неверный email или пароль.":"Не удалось выполнить вход."},invalid?401:502,origin)
    }

    const {data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",data.user.id).maybeSingle()
    if(profileError)return json({error:"Не удалось проверить профиль тренера."},502,origin)
    if(profile?.role!=="trainer"){
      await client.auth.signOut().catch(()=>undefined)
      return json({error:"Этот аккаунт не имеет доступа к кабинету тренера."},403,origin)
    }

    return json({
      access_token:data.session.access_token,
      refresh_token:data.session.refresh_token,
      expires_at:data.session.expires_at,
      expires_in:data.session.expires_in,
    },200,origin)
  }catch(error){
    console.error("trainer-login-fallback failed",error instanceof Error?error.message:String(error))
    return json({error:"Резервный сервер входа недоступен."},502,origin)
  }
})
