import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Globe2, GraduationCap, Instagram, MessageCircle, Phone, Sparkles, UserRound } from 'lucide-react'
import { loadTrainerPublicProfile, type TrainerPublicProfile } from '../features/trainerProfile/service'
import { neutralAvatars } from '../features/profile/types'

type Props={preview:boolean}

const previewProfile:TrainerPublicProfile={
  trainer_id:'preview-trainer',
  display_name:'Андрей Шевцов',
  nickname:'Тренер',
  avatar_url:null,
  avatar_key:'owl',
  headline:'Тренер ANDREWAY Fit',
  welcome_message:'Привет! Здесь можно узнать обо мне и выбрать удобный способ связи.',
  about_text:'Помогаю выстроить понятную систему питания, тренировок и контроля прогресса без лишней сложности.',
  experience_text:'Этот блок тренер заполняет сам: опыт работы, направления, проекты и то, что считает важным рассказать клиенту.',
  approach_text:'Система должна работать в обычной жизни, а не только в идеальную неделю. Поэтому мы опираемся на небольшие, повторяемые действия и реальные данные.',
  specialties_text:'Снижение веса · силовые тренировки · питание · привычки',
  education_text:'Здесь можно указать обучение, сертификаты и другие подтверждения квалификации.',
  is_published:true,
  contacts:[
    {id:'p1',trainer_id:'preview-trainer',channel:'telegram',url:'#',label:'Telegram',enabled:true,sort_order:10},
    {id:'p2',trainer_id:'preview-trainer',channel:'whatsapp',url:'#',label:'WhatsApp',enabled:true,sort_order:20},
    {id:'p3',trainer_id:'preview-trainer',channel:'max',url:'#',label:'MAX',enabled:true,sort_order:30},
    {id:'p4',trainer_id:'preview-trainer',channel:'phone',url:'tel:+79181142693',label:'Телефон',enabled:true,sort_order:40},
  ],
}

function contactIcon(channel:string){
  if(channel==='instagram')return Instagram
  if(channel==='phone')return Phone
  if(channel==='website')return Globe2
  return MessageCircle
}

function contactLabel(channel:string,label:string|null){
  if(label)return label
  if(channel==='instagram')return 'Instagram'
  if(channel==='phone')return 'Телефон'
  if(channel==='website')return 'Сайт'
  return channel
}

export function TrainerProfilePage({preview}:Props){
  const [profile,setProfile]=useState<TrainerPublicProfile|null>(preview?previewProfile:null)
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    if(preview){setProfile(previewProfile);setLoading(false);return}
    let cancelled=false
    loadTrainerPublicProfile()
      .then(value=>{if(!cancelled)setProfile(value)})
      .catch(e=>{if(!cancelled)setNotice(e instanceof Error?e.message:'Не удалось загрузить профиль тренера')})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[preview])

  const avatar=useMemo(()=>{
    if(!profile)return null
    return neutralAvatars.find(item=>item.key===profile.avatar_key)?.emoji??profile.display_name.slice(0,1)
  },[profile])

  const infoBlocks=profile?[
    {key:'about',title:'Обо мне',icon:UserRound,text:profile.about_text},
    {key:'experience',title:'Опыт',icon:Sparkles,text:profile.experience_text},
    {key:'approach',title:'Как я работаю',icon:MessageCircle,text:profile.approach_text},
    {key:'specialties',title:'Направления',icon:Sparkles,text:profile.specialties_text},
    {key:'education',title:'Обучение и квалификация',icon:GraduationCap,text:profile.education_text},
  ].filter(item=>item.text?.trim()):[]

  if(loading)return <div className="page-stack"><section className="panel"><div className="library-empty">Загружаю профиль тренера…</div></section></div>
  if(notice)return <div className="page-stack"><div className="drawer-notice">{notice}</div></div>
  if(!profile)return <div className="page-stack"><section className="panel"><div className="library-empty">Публичный профиль тренера пока не опубликован.</div></section></div>

  return <div className="page-stack trainer-public-page">
    <section className="panel trainer-public-hero">
      <div className="trainer-public-avatar">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:<span>{avatar}</span>}</div>
      <div className="trainer-public-intro">
        <span className="eyebrow">Ваш тренер</span>
        <h2>{profile.display_name}</h2>
        {profile.headline&&<strong className="trainer-public-headline">{profile.headline}</strong>}
        {profile.welcome_message&&<p>{profile.welcome_message}</p>}
      </div>
    </section>

    {infoBlocks.length>0&&<section className="trainer-public-grid">
      {infoBlocks.map(({key,title,icon:Icon,text})=><article className="panel trainer-public-info" key={key}>
        <div className="trainer-public-info-head"><span><Icon size={18}/></span><h3>{title}</h3></div>
        <p>{text}</p>
      </article>)}
    </section>}

    <section className="panel trainer-public-contacts">
      <div className="panel-head"><div><span className="eyebrow">Связь</span><h3>Как связаться</h3></div><MessageCircle size={19}/></div>
      <p className="panel-description">Выбери удобный канал. Мессенджеры откроются напрямую в приложении или веб-версии.</p>
      {profile.contacts.length===0?<div className="library-empty">Тренер пока не добавил публичные контакты.</div>:<div className="trainer-public-contact-list">
        {profile.contacts.map(item=>{
          const Icon=contactIcon(item.channel)
          const external=item.channel!=='phone'
          return <a key={item.id} href={item.url} target={external?'_blank':undefined} rel={external?'noreferrer':undefined}>
            <span className="trainer-public-contact-icon"><Icon size={18}/></span>
            <strong>{contactLabel(item.channel,item.label)}</strong>
            {external&&<ExternalLink size={15}/>}
          </a>
        })}
      </div>}
    </section>
  </div>
}
