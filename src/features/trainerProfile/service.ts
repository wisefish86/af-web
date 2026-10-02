import { supabase } from '../../lib/supabase'
import { loadTrainerContactChannels, type TrainerContactChannel } from '../contacts/service'

export type TrainerPublicProfile={
  trainer_id:string
  display_name:string
  nickname:string|null
  avatar_url:string|null
  avatar_key:string|null
  headline:string|null
  welcome_message:string|null
  about_text:string|null
  experience_text:string|null
  approach_text:string|null
  specialties_text:string|null
  education_text:string|null
  is_published:boolean
  contacts:TrainerContactChannel[]
}

export type TrainerPublicProfileDraft={
  headline:string
  welcome_message:string
  about_text:string
  experience_text:string
  approach_text:string
  specialties_text:string
  education_text:string
  is_published:boolean
}

export const emptyTrainerPublicProfileDraft:TrainerPublicProfileDraft={
  headline:'',
  welcome_message:'',
  about_text:'',
  experience_text:'',
  approach_text:'',
  specialties_text:'',
  education_text:'',
  is_published:true,
}

async function resolveTrainerId():Promise<string|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const uid=auth.user.id

  const {data:profile,error:profileError}=await supabase.from('profiles').select('role').eq('id',uid).maybeSingle()
  if(profileError)throw profileError
  if(profile?.role==='trainer')return uid

  const {data:link,error:linkError}=await supabase.from('coach_clients')
    .select('coach_id,started_at')
    .eq('client_id',uid)
    .eq('status','active')
    .order('started_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(linkError)throw linkError
  return link?.coach_id??null
}

export async function loadTrainerPublicProfile():Promise<TrainerPublicProfile|null>{
  if(!supabase)throw new Error('Supabase не подключён')
  const trainerId=await resolveTrainerId()
  if(!trainerId)return null

  const [{data:publicProfile,error:publicError},contacts]=await Promise.all([
    supabase.from('trainer_public_profiles')
      .select('trainer_id,public_name,public_nickname,public_avatar_url,public_avatar_key,headline,welcome_message,about_text,experience_text,approach_text,specialties_text,education_text,is_published')
      .eq('trainer_id',trainerId)
      .maybeSingle(),
    loadTrainerContactChannels(),
  ])
  if(publicError)throw publicError
  if(!publicProfile||!publicProfile.is_published)return null

  return {
    trainer_id:trainerId,
    display_name:publicProfile.public_name??'Тренер',
    nickname:publicProfile.public_nickname??null,
    avatar_url:publicProfile.public_avatar_url??null,
    avatar_key:publicProfile.public_avatar_key??null,
    headline:publicProfile.headline??null,
    welcome_message:publicProfile.welcome_message??null,
    about_text:publicProfile.about_text??null,
    experience_text:publicProfile.experience_text??null,
    approach_text:publicProfile.approach_text??null,
    specialties_text:publicProfile.specialties_text??null,
    education_text:publicProfile.education_text??null,
    is_published:publicProfile.is_published,
    contacts,
  }
}

export async function loadMyTrainerPublicProfileDraft():Promise<TrainerPublicProfileDraft>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const {data,error}=await supabase.from('trainer_public_profiles')
    .select('headline,welcome_message,about_text,experience_text,approach_text,specialties_text,education_text,is_published')
    .eq('trainer_id',auth.user.id)
    .maybeSingle()
  if(error)throw error
  if(!data)return {...emptyTrainerPublicProfileDraft}
  return {
    headline:data.headline??'',
    welcome_message:data.welcome_message??'',
    about_text:data.about_text??'',
    experience_text:data.experience_text??'',
    approach_text:data.approach_text??'',
    specialties_text:data.specialties_text??'',
    education_text:data.education_text??'',
    is_published:data.is_published??true,
  }
}

export async function saveMyTrainerPublicProfileDraft(input:TrainerPublicProfileDraft):Promise<void>{
  if(!supabase)throw new Error('Supabase не подключён')
  const {data:auth,error:authError}=await supabase.auth.getUser()
  if(authError||!auth.user)throw authError??new Error('Нужно войти')
  const nullable=(value:string)=>value.trim()||null
  const {error}=await supabase.from('trainer_public_profiles').upsert({
    trainer_id:auth.user.id,
    headline:nullable(input.headline),
    welcome_message:nullable(input.welcome_message),
    about_text:nullable(input.about_text),
    experience_text:nullable(input.experience_text),
    approach_text:nullable(input.approach_text),
    specialties_text:nullable(input.specialties_text),
    education_text:nullable(input.education_text),
    is_published:input.is_published,
    updated_at:new Date().toISOString(),
  },{onConflict:'trainer_id'})
  if(error)throw error
}
