import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import { Client } from "npm:basic-ftp@5.2.0"
import { Readable } from "node:stream"
import { Buffer } from "node:buffer"

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})

const PUBLIC_BASE=(Deno.env.get("EXERCISE_MEDIA_PUBLIC_BASE")||"https://fit.andreway.ru/media/exercises").replace(/\/+$/,"")
const FTP_ROOT=(Deno.env.get("EXERCISE_MEDIA_FTP_ROOT")||"/www/fit.andreway.ru/media/exercises").replace(/\/+$/,"")
const FTP_HOST=Deno.env.get("EXERCISE_MEDIA_FTP_HOST")||"andreway.ru"
const FTP_PORT=Number(Deno.env.get("EXERCISE_MEDIA_FTP_PORT")||"21")
const FTP_USER=Deno.env.get("EXERCISE_MEDIA_FTP_USER")||"andreway"
const FTP_PASSWORD=Deno.env.get("EXERCISE_MEDIA_FTP_PASSWORD")||Deno.env.get("FIT_FTP_PASSWORD")||""

function safeExerciseId(value:string){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
function mediaSpec(kind:string,file:File){
  if(kind==="image"){
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":file.type==="image/jpeg"?"jpg":""
    if(!ext)throw new Error("UNSUPPORTED_IMAGE")
    if(file.size>8*1024*1024)throw new Error("IMAGE_TOO_LARGE")
    return {ext,max:8*1024*1024}
  }
  if(kind==="video"){
    const ext=file.type==="video/webm"?"webm":file.type==="video/mp4"?"mp4":""
    if(!ext)throw new Error("UNSUPPORTED_VIDEO")
    if(file.size>50*1024*1024)throw new Error("VIDEO_TOO_LARGE")
    return {ext,max:50*1024*1024}
  }
  throw new Error("INVALID_KIND")
}
async function withFtp<T>(fn:(client:Client)=>Promise<T>){
  const client=new Client(30_000)
  client.ftp.verbose=false
  try{
    await client.access({host:FTP_HOST,port:FTP_PORT,user:FTP_USER,password:FTP_PASSWORD,secure:false})
    return await fn(client)
  } finally {
    client.close()
  }
}
async function trainerId(req:Request){
  const url=Deno.env.get("SUPABASE_URL")
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if(!url||!key)throw new Error("SERVER_AUTH_NOT_CONFIGURED")
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim()
  if(!token)throw new Error("AUTH_REQUIRED")
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await admin.auth.getUser(token)
  if(error||!data.user)throw new Error("AUTH_REQUIRED")
  const {data:profile,error:profileError}=await admin.from("profiles").select("role").eq("id",data.user.id).maybeSingle()
  if(profileError||profile?.role!=="trainer")throw new Error("TRAINER_REQUIRED")
  return data.user.id
}
function remoteFromPublicUrl(url:string){
  if(!url.startsWith(PUBLIC_BASE+"/"))throw new Error("INVALID_MEDIA_URL")
  const rel=url.slice(PUBLIC_BASE.length+1)
  if(!rel||rel.includes("..")||rel.startsWith("/"))throw new Error("INVALID_MEDIA_URL")
  return FTP_ROOT+"/"+rel
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors})
  if(req.method!=="POST")return json({error:"Method not allowed"},405)

  try{await trainerId(req)}
  catch(error){
    const code=error instanceof Error?error.message:"AUTH_REQUIRED"
    if(code==="TRAINER_REQUIRED")return json({error:"Trainer role required"},403)
    if(code==="SERVER_AUTH_NOT_CONFIGURED")return json({error:"Server auth is not configured"},500)
    return json({error:"Authentication required"},401)
  }

  if(!FTP_PASSWORD)return json({configured:false,reason:"ftp_secret_missing"})

  let form:FormData
  try{form=await req.formData()}catch{return json({error:"Invalid multipart request"},400)}
  const action=String(form.get("action")||"upload")

  if(action==="delete"){
    const url=String(form.get("url")||"")
    try{
      const remote=remoteFromPublicUrl(url)
      await withFtp(async client=>{try{await client.remove(remote)}catch(error){
        const msg=error instanceof Error?error.message:""
        if(!/550|not found|no such file/i.test(msg))throw error
      }})
      return json({configured:true,deleted:true})
    }catch(error){
      return json({error:error instanceof Error?error.message:"FTP delete failed"},502)
    }
  }

  const exerciseId=String(form.get("exercise_id")||"")
  const kind=String(form.get("kind")||"")
  const file=form.get("file")
  if(!safeExerciseId(exerciseId))return json({error:"Invalid exercise id"},400)
  if(!(file instanceof File))return json({error:"File required"},400)

  let spec:{ext:string;max:number}
  try{spec=mediaSpec(kind,file)}
  catch(error){
    const code=error instanceof Error?error.message:"INVALID_FILE"
    const message=code==="IMAGE_TOO_LARGE"?"Изображение должно быть не больше 8 МБ."
      :code==="VIDEO_TOO_LARGE"?"Видео должно быть не больше 50 МБ."
      :code==="UNSUPPORTED_IMAGE"?"Поддерживаются JPG, PNG и WebP."
      :code==="UNSUPPORTED_VIDEO"?"Поддерживаются MP4 и WebM."
      :"Неверный тип медиа."
    return json({error:message},400)
  }

  const fileName=crypto.randomUUID()+"."+spec.ext
  const rel=exerciseId+"/"+kind+"/"+fileName
  const remote=FTP_ROOT+"/"+rel
  try{
    const bytes=Buffer.from(await file.arrayBuffer())
    await withFtp(async client=>{
      await client.ensureDir(FTP_ROOT+"/"+exerciseId+"/"+kind)
      await client.uploadFrom(Readable.from(bytes),remote)
    })
    return json({configured:true,url:PUBLIC_BASE+"/"+rel})
  }catch(error){
    return json({error:"Не удалось загрузить файл на медиахостинг.",detail:error instanceof Error?error.message:null},502)
  }
})
