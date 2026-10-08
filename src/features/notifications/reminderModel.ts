export type ReminderPresetData={
  client_id:string
  module_code:string|null
  reminder_type:string
  name:string
  local_time:string
  weekdays:number[]
  timezone:string
  enabled:boolean
  channels:string[]
  recipient_mode:'client'
  skip_if_completed:boolean
  title_template:string
  body_template:string
  action_path:string
  settings:Record<string,unknown>
}

export function makeReminderPreset(clientId:string,type:string,timezone='Europe/Moscow'):ReminderPresetData{
  const common={
    client_id:clientId,timezone,enabled:true,channels:['in_app','telegram'],
    recipient_mode:'client' as const,skip_if_completed:true,settings:{} as Record<string,unknown>,
  }
  if(type==='weight')return {...common,module_code:'progress',reminder_type:'weight',name:'Взвешивание',local_time:'08:00:00',weekdays:[1,3,6],title_template:'Пора взвеситься',body_template:'Запиши утренний вес. Если уже записал — напоминание будет пропущено.',action_path:'/progress'}
  if(type==='waist')return {...common,module_code:'progress',reminder_type:'waist',name:'Замер талии',local_time:'08:10:00',weekdays:[6],title_template:'Замер талии',body_template:'Сегодня день контрольного замера талии.',action_path:'/progress'}
  if(type==='nutrition')return {...common,module_code:'nutrition',reminder_type:'nutrition',name:'Питание за день',local_time:'21:00:00',weekdays:[1,2,3,4,5,6,7],title_template:'Как прошло питание?',body_template:'Отметь соблюдение Meal Plan и, если нужно, перебор или недобор калорий.',action_path:'/nutrition'}
  if(type==='daily_checkin')return {...common,module_code:'checkins',reminder_type:'daily_checkin',name:'Самочувствие',local_time:'21:10:00',weekdays:[1,2,3,4,5,6,7],title_template:'Как самочувствие?',body_template:'Коротко отметь энергию, сон, стресс, голод и лёгкость соблюдения питания.',action_path:'/'}
  if(type==='monthly_measurements')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'monthly_measurements',name:'Дополнительные замеры',local_time:'09:00:00',weekdays:[6],title_template:'Ежемесячные замеры',body_template:'Если в этом месяце ещё не снимал объёмы — самое время.',action_path:'/progress'}
  if(type==='progress_photo')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'progress_photo',name:'Фото прогресса',local_time:'09:15:00',weekdays:[6],title_template:'Фото прогресса',body_template:'Сделай фото для себя в одинаковом свете и ракурсе. Загружать его в приложение не нужно.',action_path:'/progress'}
  if(type==='monthly_checkin')return {...common,settings:{period:'monthly'},module_code:'progress',reminder_type:'monthly_checkin',name:'Ежемесячный обзор',local_time:'20:30:00',weekdays:[7],title_template:'Итоги месяца',body_template:'Коротко оцени самочувствие, форму, сон и питание за месяц.',action_path:'/progress'}
  return {...common,module_code:'training',reminder_type:'workout',name:'Тренировка',local_time:'18:00:00',weekdays:[1,3,5],title_template:'Сегодня тренировка',body_template:'Открой тренировку, когда будешь готов начать.',action_path:'/workouts'}
}

export function reminderWeekdaysIssue(enabled:boolean,weekdays:number[]|null|undefined){
  if(enabled&&(!weekdays||weekdays.length===0))return 'Для включённого напоминания выбери хотя бы один день.'
  if((weekdays??[]).some(day=>!Number.isInteger(day)||day<1||day>7))return 'Дни недели должны быть от 1 до 7.'
  return null
}
