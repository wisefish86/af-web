import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}
const j=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}})
const norm=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32)
const encoder=new TextEncoder()
function base64Url(bytes:Uint8Array){let s="";for(const byte of bytes)s+=String.fromCharCode(byte);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function inviteToken(){return base64Url(crypto.getRandomValues(new Uint8Array(24)))}
async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value)));return [...d].map(v=>v.toString(16).padStart(2,"0")).join("")}
const translit=(v:string)=>[...v.toLowerCase()].map(ch=>({"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"} as Record<string,string>)[ch]??ch).join("")
function password(){const a="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";const b=new Uint32Array(12);crypto.getRandomValues(b);const r=[...b].map(n=>a[n%a.length]).join("");return r.slice(0,4)+"-"+r.slice(4,8)+"-"+r.slice(8,12)}
function loginSuffix(){
  const bytes=new Uint8Array(4);crypto.getRandomValues(bytes)
  return [...bytes].map(v=>(v%36).toString(36)).join("")
}
async function uniqueLogin(admin:any,requested:string,name:string){
  const explicit=norm(requested)
  if(explicit){
    const {data,error}=await admin.from("profiles").select("id").ilike("login_alias",explicit).limit(1)
    if(error)throw error
    if(data?.length)throw new Error("LOGIN_ALREADY_EXISTS")
    return explicit
  }

  const base=norm(translit(name)).slice(0,18)||"client"
  for(let i=0;i<25;i++){
    const s="-"+loginSuffix()
    const x=(base.slice(0,Math.max(3,32-s.length))+s).slice(0,32)
    const {data,error}=await admin.from("profiles").select("id").ilike("login_alias",x).limit(1)
    if(error)throw error
    if(!data?.length)return x
  }
  return "client-"+crypto.randomUUID().slice(0,8)
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors})
  if(req.method!=="POST")return j({error:"Method not allowed"},405)
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if(!url||!key)return j({error:"Server auth is not configured"},500)
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim()
  if(!token)return j({error:"Authentication required"},401)
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:u,error:ue}=await admin.auth.getUser(token)
  if(ue||!u.user)return j({error:"Authentication required"},401)
  const coachId=u.user.id
  const {data:coach}=await admin.from("profiles").select("role").eq("id",coachId).maybeSingle()
  if(coach?.role!=="trainer")return j({error:"Trainer role required"},403)
  let body:any={}; try{body=await req.json()}catch{return j({error:"Invalid request"},400)}
  const action=String(body.action||"")

  if(action==="create_telegram_invite"){
    const invite=inviteToken()
    const tokenHash=await sha256Hex(invite)
    const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString()
    const {error}=await admin.from("client_invites").insert({
      coach_id:coachId,
      token_hash:tokenHash,
      expires_at:expiresAt,
    })
    if(error)return j({error:"Не удалось создать приглашение."},500)
    const botUsername=Deno.env.get("TELEGRAM_BOT_USERNAME")||"andreyfit_bot"
    return j({
      invite_url:"https://t.me/"+botUsername+"?start="+encodeURIComponent("invite_"+invite),
      expires_at:expiresAt,
    })
  }

  if(action==="create"){
    const name=String(body.display_name||"").trim().slice(0,60); if(!name)return j({error:"Укажи имя клиента."},400)
    const nickname=String(body.nickname||"").trim().slice(0,40)
    const age=body.age==null||body.age===""?null:Math.round(Number(body.age))
    if(age!=null&&(age<13||age>100))return j({error:"Возраст должен быть от 13 до 100 лет."},400)
    const requested=String(body.login||""); if(requested.trim()&&norm(requested).length<3)return j({error:"Логин слишком короткий."},400)
    let login=""
    try{login=await uniqueLogin(admin,requested,name)}
    catch(error){
      if(error instanceof Error&&error.message==="LOGIN_ALREADY_EXISTS")return j({error:"Такой логин уже используется. Выбери другой."},409)
      return j({error:"Не удалось проверить доступность логина."},500)
    }
    const pass=password()
    const {data:created,error:ce}=await admin.auth.admin.createUser({email:login+"@users.andreway.ru",password:pass,email_confirm:true,user_metadata:{display_name:name,login_alias:login,nickname:nickname||null,age}})
    if(ce||!created.user){
      const duplicate=/already registered|already exists|duplicate/i.test(ce?.message||"")
      return j({error:duplicate?"Такой логин уже используется. Выбери другой.":(ce?.message||"Не удалось создать аккаунт.")},duplicate?409:400)
    }
    const id=created.user.id
    try{
      const {error:e1}=await admin.from("profiles").update({display_name:name,login_alias:login,nickname:nickname||null,age,must_set_password:true,updated_at:new Date().toISOString()}).eq("id",id); if(e1)throw e1
      const {error:e2}=await admin.rpc("provision_trainer_created_client",{p_client_id:id,p_coach_id:coachId}); if(e2)throw e2
    }catch(e){await admin.auth.admin.deleteUser(id);return j({error:e instanceof Error?e.message:"Не удалось подготовить кабинет."},500)}
    return j({client_id:id,login,password:pass})
  }

  const clientId=String(body.client_id||"")
  if(!clientId)return j({error:"Client id required"},400)
  const {data:link}=await admin.from("coach_clients").select("client_id,status").eq("coach_id",coachId).eq("client_id",clientId).maybeSingle()
  if(!link)return j({error:"Клиент не назначен этому тренеру."},403)

  if(action==="reset_password"){
    if(link.status!=="active")return j({error:"Сначала верни клиента в активное сопровождение, затем сбрасывай пароль."},409)
    const {data:p,error:profileReadError}=await admin.from("profiles").select("display_name,login_alias,must_set_password").eq("id",clientId).maybeSingle()
    if(profileReadError)return j({error:"Не удалось загрузить профиль клиента."},500)
    if(!p)return j({error:"Клиент не найден."},404)

    let login=p.login_alias||""
    if(!login){
      try{login=await uniqueLogin(admin,"",p.display_name||"client")}
      catch{return j({error:"Не удалось подготовить новый логин."},500)}
    }
    const pass=password()
    const previousLogin=p.login_alias??null
    const previousMustSet=Boolean(p.must_set_password)

    // Prepare the profile first because this write is compensatable. If Auth later
    // fails, restore the previous profile state. Never leave a new temporary
    // password active while must_set_password remains false.
    const {error:prepareError}=await admin.from("profiles")
      .update({login_alias:login,must_set_password:true,updated_at:new Date().toISOString()})
      .eq("id",clientId)
      .select("id")
      .single()
    if(prepareError)return j({error:prepareError.message},500)

    const attrs:any={password:pass}
    if(!previousLogin){attrs.email=login+"@users.andreway.ru";attrs.email_confirm=true}
    const {error:authUpdateError}=await admin.auth.admin.updateUserById(clientId,attrs)
    if(authUpdateError){
      const {error:rollbackError}=await admin.from("profiles")
        .update({login_alias:previousLogin,must_set_password:previousMustSet,updated_at:new Date().toISOString()})
        .eq("id",clientId)
        .select("id")
        .single()
      return j({
        error:rollbackError
          ?"Сброс пароля не завершён, а состояние профиля требует проверки администратором."
          :authUpdateError.message
      },rollbackError?500:400)
    }

    return j({client_id:clientId,login,password:pass})
  }

  if(action==="set_status"){
    const status=String(body.status||"")
    if(!["active","paused","finished"].includes(status))return j({error:"Unknown status"},400)
    if(status===link.status)return j({client_id:clientId,status})

    const previousStatus=String(link.status)
    const targetBan=status==="active"?"none":"876000h"
    const previousBan=previousStatus==="active"?"none":"876000h"

    const {error:ae}=await admin.auth.admin.updateUserById(clientId,{ban_duration:targetBan} as any)
    if(ae)return j({error:ae.message},400)

    const {data:updated,error:le}=await admin.from("coach_clients")
      .update({status,ended_at:status==="finished"?new Date().toISOString().slice(0,10):null})
      .eq("coach_id",coachId).eq("client_id",clientId)
      .select("status").single()

    if(le||updated?.status!==status){
      const {error:rollbackError}=await admin.auth.admin.updateUserById(clientId,{ban_duration:previousBan} as any)
      return j({
        error:rollbackError
          ?"Не удалось изменить статус клиента, а откат блокировки требует проверки администратором."
          :(le?.message||"Не удалось сохранить новый статус клиента.")
      },500)
    }
    return j({client_id:clientId,status})
  }

  if(action==="delete"){
    if(link.status!=="finished")return j({error:"Удаление навсегда доступно только для клиента в архиве."},409)
    if(String(body.confirm||"")!=="DELETE")return j({error:"Confirmation required"},400)
    const {error}=await admin.rpc("delete_client_account_hard",{p_client_id:clientId})
    if(error)return j({error:error.message},500)
    return j({client_id:clientId,deleted:true})
  }

  return j({error:"Unknown action"},400)
})