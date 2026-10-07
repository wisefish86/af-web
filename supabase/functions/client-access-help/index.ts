import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
}
function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"},
  })
}

/**
 * Password-help must never confirm whether a client login exists.
 *
 * During the single-trainer pilot we return the same public trainer contacts
 * for every POST request. When multi-trainer tenancy is introduced this must
 * be routed by an explicit public tenant/trainer context (domain/link), never
 * by looking up a client login.
 */
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors})
  if(req.method!=="POST")return json({trainer_name:null,contacts:[]},405)

  const url=Deno.env.get("SUPABASE_URL")
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if(!url||!serviceKey)return json({trainer_name:null,contacts:[]})

  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})

  const {data:trainers,error:trainerError}=await admin.from("trainer_public_profiles")
    .select("trainer_id,public_name")
    .order("trainer_id")
    .limit(2)

  if(trainerError||!trainers||trainers.length!==1){
    // Fail closed. Importantly, this response does not depend on client login.
    return json({trainer_name:null,contacts:[]})
  }

  const trainer=trainers[0]
  const {data:contacts,error:contactError}=await admin.from("trainer_contact_channels")
    .select("channel,url,label,sort_order")
    .eq("trainer_id",trainer.trainer_id)
    .eq("enabled",true)
    .in("channel",["telegram","whatsapp","max"])
    .order("sort_order")

  return json({
    trainer_name:trainer.public_name??null,
    contacts:contactError?[]:(contacts??[]).map(item=>({
      channel:item.channel,url:item.url,label:item.label,
    })),
  })
})
