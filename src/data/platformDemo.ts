export type ModuleCode = 'nutrition' | 'training' | 'progress' | 'checkins' | 'notifications'

export const serviceModules: Array<{
  code: ModuleCode
  name: string
  description: string
}> = [
  { code: 'nutrition', name: 'Питание', description: 'Meal Plan, продукты, цели и дневная отметка питания' },
  { code: 'training', name: 'Тренировки', description: 'Программы, упражнения и история тренировок' },
  { code: 'progress', name: 'Прогресс', description: 'Вес, талия, объёмы и фото прогресса для себя' },
  { code: 'checkins', name: 'Самочувствие', description: 'Короткие ежедневные и ежемесячные чек-ины' },
  { code: 'notifications', name: 'Напоминания', description: 'Уведомления внутри Andrey Fit' },
]

export const trackingGroups = [
  {
    title: 'Быстрый ежедневный контроль',
    description: 'Короткие вопросы о самочувствии и восстановлении. Калории/белок заполняются в «Питании», тренировки учитываются автоматически.',
    items: [
      { code: 'hunger', label: 'Голод', enabled: true, required: false, clientCanHide: true },
      { code: 'energy', label: 'Энергия', enabled: true, required: false, clientCanHide: true },
      { code: 'stress', label: 'Стресс', enabled: true, required: false, clientCanHide: true },
      { code: 'sleep', label: 'Сон', enabled: true, required: false, clientCanHide: true },
      { code: 'ease', label: 'Насколько легко соблюдать питание', enabled: true, required: false, clientCanHide: true },
    ],
  },
  {
    title: 'Замеры',
    description: 'Вес — базовый. Талия еженедельно, дополнительные объёмы — примерно раз в месяц.',
    items: [
      { code: 'weight', label: 'Вес', enabled: true, required: false, clientCanHide: false },
      { code: 'waist', label: 'Талия', enabled: true, required: false, clientCanHide: true },
      { code: 'chest', label: 'Грудь', enabled: true, required: false, clientCanHide: true },
      { code: 'hips', label: 'Таз / бёдра', enabled: true, required: false, clientCanHide: true },
      { code: 'thigh', label: 'Бедро', enabled: true, required: false, clientCanHide: true },
      { code: 'arm_relaxed', label: 'Рука расслаблена', enabled: true, required: false, clientCanHide: true },
      { code: 'arm_flexed', label: 'Рука напряжена', enabled: true, required: false, clientCanHide: true },
    ],
  },
  {
    title: 'Ежемесячный обзор',
    description: 'Субъективные оценки 1–10. Клиент может скрыть ненужные необязательные вопросы.',
    items: [
      { code: 'appearance', label: 'Внешний вид', enabled: true, required: false, clientCanHide: true },
      { code: 'fitness', label: 'Форма', enabled: true, required: false, clientCanHide: true },
      { code: 'physical_comfort', label: 'Физический комфорт', enabled: true, required: false, clientCanHide: true },
      { code: 'monthly_energy', label: 'Энергия за месяц', enabled: true, required: false, clientCanHide: true },
      { code: 'sleep_recovery', label: 'Сон и восстановление', enabled: true, required: false, clientCanHide: true },
      { code: 'nutrition', label: 'Питание', enabled: true, required: false, clientCanHide: true },
      { code: 'relationship_with_food', label: 'Отношение к еде', enabled: false, required: false, clientCanHide: true },
    ],
  },
]

export const reminderPresets = [
  { name: 'Вес', schedule: 'ПН · СР · СБ, 08:00', note: 'Не напоминать, если вес уже внесён' },
  { name: 'Талия', schedule: 'СБ, 08:10', note: 'Раз в неделю' },
  { name: 'Силовая', schedule: 'ПН · СР · ПТ, 18:00', note: 'Можно изменить под расписание клиента' },
  { name: 'Питание', schedule: 'Каждый день, 21:00', note: 'Отметка Meal Plan / перебор / недобор' },
  { name: 'Самочувствие', schedule: 'Каждый день, 21:10', note: 'Пропускается, если чек-ин уже заполнен' },
  { name: 'Месячный контроль', schedule: 'Первая суббота месяца', note: 'Объёмы и фото прогресса для себя' },
]
