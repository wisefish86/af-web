export type ModuleCode = 'nutrition' | 'training' | 'progress' | 'checkins' | 'notifications'

export const serviceModules: Array<{
  code: ModuleCode
  name: string
  description: string
}> = [
  { code: 'nutrition', name: 'Питание', description: 'Меню, продукты, цели и дневник питания' },
  { code: 'training', name: 'Тренировки', description: 'Программы, упражнения и история тренировок' },
  { code: 'progress', name: 'Прогресс', description: 'Вес, талия, фото и другие замеры' },
  { code: 'checkins', name: 'Самочувствие', description: 'Ежедневные и ежемесячные чек-ины' },
  { code: 'notifications', name: 'Напоминания', description: 'Telegram и другие каналы связи' },
]

export const trackingGroups = [
  {
    title: 'Быстрый ежедневный контроль',
    description: 'Только то, что действительно помогает сопровождению.',
    items: [
      { code: 'calories', label: 'Калории', enabled: true, required: false, clientCanHide: true },
      { code: 'protein', label: 'Белок', enabled: true, required: false, clientCanHide: true },
      { code: 'steps', label: 'Шаги', enabled: false, required: false, clientCanHide: true },
      { code: 'trained', label: 'Тренировка', enabled: true, required: false, clientCanHide: true },
      { code: 'hunger', label: 'Голод', enabled: false, required: false, clientCanHide: true },
      { code: 'energy', label: 'Энергия', enabled: false, required: false, clientCanHide: true },
      { code: 'stress', label: 'Стресс', enabled: false, required: false, clientCanHide: true },
      { code: 'sleep', label: 'Сон', enabled: false, required: false, clientCanHide: true },
    ],
  },
  {
    title: 'Замеры',
    description: 'Можно оставить только вес или включить дополнительные объёмы.',
    items: [
      { code: 'weight', label: 'Вес', enabled: true, required: true, clientCanHide: false },
      { code: 'waist', label: 'Талия', enabled: true, required: false, clientCanHide: true },
      { code: 'chest', label: 'Грудь', enabled: false, required: false, clientCanHide: true },
      { code: 'hips', label: 'Таз', enabled: false, required: false, clientCanHide: true },
      { code: 'thigh', label: 'Бедро', enabled: false, required: false, clientCanHide: true },
    ],
  },
  {
    title: 'Ежемесячный обзор',
    description: 'Субъективные оценки можно полностью отключить для клиента.',
    items: [
      { code: 'appearance', label: 'Внешний вид', enabled: true, required: false, clientCanHide: true },
      { code: 'fitness', label: 'Форма', enabled: true, required: false, clientCanHide: true },
      { code: 'physical_comfort', label: 'Физический комфорт', enabled: true, required: false, clientCanHide: true },
      { code: 'sleep_recovery', label: 'Сон и восстановление', enabled: true, required: false, clientCanHide: true },
      { code: 'relationship_with_food', label: 'Отношение к еде', enabled: false, required: false, clientCanHide: true },
    ],
  },
]

export const reminderPresets = [
  { name: 'Вес', schedule: 'ПН · СР · СБ, 08:00', note: 'Не отправлять, если вес уже внесён' },
  { name: 'Талия', schedule: 'ВС, 09:00', note: 'Раз в неделю' },
  { name: 'Тренировка', schedule: 'За 2 часа до плана', note: 'Только в тренировочные дни' },
]
