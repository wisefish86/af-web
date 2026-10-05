import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const defaultUrl = 'https://jjaunlbglskpddslwegp.supabase.co'
const defaultPublishableKey = 'sb_publishable_AKvYjBjCJIyCOwJ1M1ooqQ_dFkmSmml'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || defaultUrl
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || defaultPublishableKey

// The publishable key is intentionally safe to ship in browser code.
// Authorization is enforced by PostgreSQL Row Level Security.
export const hasSupabaseConfig = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null


let verifiedUserCache:{user:User;expiresAt:number}|null=null
let verifiedUserRequest:Promise<User>|null=null

export async function getVerifiedUser():Promise<User>{
  if(!supabase)throw new Error('Supabase не подключён')
  const now=Date.now()
  if(verifiedUserCache&&verifiedUserCache.expiresAt>now)return verifiedUserCache.user
  if(verifiedUserRequest)return verifiedUserRequest
  verifiedUserRequest=supabase.auth.getUser().then(({data,error})=>{
    if(error||!data.user)throw error??new Error('Нужно войти')
    verifiedUserCache={user:data.user,expiresAt:Date.now()+30000}
    return data.user
  }).finally(()=>{verifiedUserRequest=null})
  return verifiedUserRequest
}

export function clearVerifiedUserCache(){verifiedUserCache=null;verifiedUserRequest=null}

if(supabase){
  supabase.auth.onAuthStateChange(()=>clearVerifiedUserCache())
}
