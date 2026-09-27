export type ClientProfile = {
  id:string
  display_name:string
  login_alias:string|null
  nickname:string|null
  age:number|null
  city:string|null
  timezone:string
  avatar_key:string|null
}

export const neutralAvatars = [
  {key:'fox',label:'Лиса',emoji:'🦊'},
  {key:'bear',label:'Медведь',emoji:'🐻'},
  {key:'owl',label:'Сова',emoji:'🦉'},
  {key:'panda',label:'Панда',emoji:'🐼'},
  {key:'tiger',label:'Тигр',emoji:'🐯'},
  {key:'dog',label:'Собака',emoji:'🐶'},
] as const
