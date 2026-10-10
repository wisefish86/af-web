import { expect, test } from '@playwright/test'

const preview='/\?qa=client-preview-20261005#'
const recoveryPreview='/?qa=client-preview-20261005&qaRecovery=1#'
const nutritionSetupRecoveryPreview='/?qa=client-preview-20261005&qaRecovery=1&qaNutritionNoPlan=1#'

test.describe('client preview critical behavior',()=>{
  test('trainer chat opens Telegram directly without an intermediate sheet',async({page})=>{
    await page.goto(preview+'/')
    const chat=page.locator('a[href="https://t.me/example"]')
    await expect(chat).toHaveAttribute('href','https://t.me/example')
    await expect(page.locator('.trainer-chat-sheet')).toHaveCount(0)
  })

  test('client PWA uses the current manifest and survives an offline reload',async({page,context})=>{
    await page.goto(preview+'/settings')
    await expect(page.locator('.settings-page')).toBeVisible()

    const manifest=await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifest).toContain('/manifest.json')

    const registration=await page.evaluate(async()=>{
      if(!('serviceWorker' in navigator))return {supported:false,script:'',controller:false}
      const ready=await navigator.serviceWorker.ready
      return {
        supported:true,
        script:ready.active?.scriptURL??'',
        controller:Boolean(navigator.serviceWorker.controller),
      }
    })
    expect(registration.supported).toBe(true)
    expect(registration.script).toContain('/sw-v6.js')

    if(!registration.controller){
      await page.reload()
      await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker?.controller))).toBe(true)
    }
    await page.reload()
    await expect.poll(()=>page.evaluate(async()=>Boolean(await caches.match('/__app_shell__')))).toBe(true)

    await context.setOffline(true)
    await page.reload({waitUntil:'domcontentloaded'})
    await expect(page.locator('.settings-page')).toBeVisible()
    await context.setOffline(false)
  })

  test('client settings hub keeps sections focused and Telegram lives under Notifications',async({page})=>{
    await page.goto(preview+'/settings')
    await expect(page.getByRole('heading',{name:'Что хочешь изменить'})).toBeVisible()
    await expect(page.getByRole('link',{name:/Профиль/})).toBeVisible()
    await expect(page.getByRole('link',{name:/Связь Уведомления/})).toBeVisible()
    await expect(page.getByRole('link',{name:/Персонализация/})).toBeVisible()
    await expect(page.getByRole('link',{name:/Приложение/})).toBeVisible()
    await expect(page.getByRole('heading',{name:'Telegram-бот'})).toHaveCount(0)

    await page.goto(preview+'/settings/profile')
    await expect(page.locator('.profile-settings-panel').getByRole('heading',{name:'Профиль'})).toBeVisible()
    await expect(page.getByLabel('Рост, см')).toHaveCount(0)
    await expect(page.getByLabel('Запястье, см')).toHaveCount(0)
    await expect(page.getByRole('heading',{name:'Telegram-бот'})).toHaveCount(0)
    await expect(page.getByRole('link',{name:'Все настройки'})).toBeVisible()

    await page.goto(preview+'/settings/notifications')
    await expect(page.getByRole('heading',{name:'Telegram-бот'})).toBeVisible()
    await expect(page.getByText('Telegram не подключён',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Подготовка…'})).toBeVisible()
    await expect(page.getByRole('link',{name:'Подключить Telegram'})).toHaveCount(0)
    await expect(page.getByText('Telegram пока не подключён. Категории сохранены, но доставка в бот не работает.')).toBeVisible()
  })

  test('Useful contains materials and body composition while Progress no longer duplicates it',async({page})=>{
    await page.goto(preview+'/')
    await expect(page.locator('.mobile-nav').getByRole('link',{name:'Полезное'})).toBeVisible()
    await expect(page.getByRole('link',{name:'Настройки'})).toBeVisible()

    await page.goto(preview+'/useful')
    await expect(page.locator('.hub-hero').getByRole('heading',{name:'Полезное'})).toBeVisible()
    await expect(page.getByRole('link',{name:/Материалы/})).toBeVisible()
    await expect(page.getByRole('link',{name:/Каркас и композиция тела/})).toBeVisible()

    await page.goto(preview+'/useful/body-composition')
    await expect(page.getByRole('heading',{name:'Каркас и композиция тела'}).first()).toBeVisible()
    await expect(page.getByText('Талия / рост',{exact:true})).toBeVisible()
    await expect(page.getByLabel('Рост, см')).toBeVisible()
    await expect(page.getByLabel('Запястье, см')).toBeVisible()

    await page.goto(preview+'/progress')
    await expect(page.getByText('Каркас и композиция тела',{exact:true})).toHaveCount(0)
  })

  test('calorie tracking shows weekly calories, protein and body trend together',async({page})=>{
    await page.goto(preview+'/nutrition')
    await page.getByRole('button',{name:'Считать калории'}).click()
    await expect(page.getByRole('heading',{name:'Последние 7 дней'})).toBeVisible()
    await expect(page.getByText('Среднее фактически',{exact:true})).toBeVisible()
    await expect(page.getByText('Белок в среднем',{exact:true})).toBeVisible()
    await expect(page.getByText('Вес · тренд недели',{exact:true})).toBeVisible()
    await expect(page.getByText('Талия',{exact:true}).first()).toBeVisible()
  })
  test('supersets are shown as a plain-language pair instead of A1/A2 codes',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    const tags=page.locator('.workout-superset-tag')
    await expect(tags).toHaveCount(2)
    await expect(tags.nth(0)).toContainText('Суперсет · 1 из 2')
    await expect(tags.nth(1)).toContainText('Суперсет · 2 из 2')
    await expect(page.getByText(/^A[12] ·/)).toHaveCount(0)

    await page.locator('.workout-exercise-summary').first().click()
    await expect(page.locator('.superset-manual-hint')).toContainText('После этого упражнения сразу переходи')
  })

  test('browser Back closes a workout overlay without leaving the workout',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()
    const exerciseUrl=page.url()
    await page.getByRole('button',{name:'Комментарии',exact:true}).click()
    await expect(page.locator('.workout-sheet')).toBeVisible()

    await page.goBack()
    await expect(page.locator('.workout-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(exerciseUrl)
  })

  test('workout route Back hierarchy returns exercise to workout then workouts page',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await expect(page).toHaveURL(/workout=preview-workout/)
    await page.locator('.workout-exercise-summary').first().click()
    await expect(page).toHaveURL(/exercise=we-press/)

    await page.goBack()
    await expect(page).toHaveURL(/#\/workouts\?workout=preview-workout$/)
    await expect(page.locator('.live-workout-hero')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/#\/workouts$/)
    await expect(page.locator('.live-workout-hero')).toHaveCount(0)
  })

  test('unfinished cardio is named explicitly before completing a mixed workout',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.getByRole('button',{name:'Завершить тренировку'}).click()

    const sheet=page.locator('.finish-workout-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('1 блок кардио')
    await sheet.getByRole('button',{name:'Продолжить тренировку'}).click()
  })

  test('preview workout schedule editor saves changed days and time',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.getByRole('button',{name:'Настроить'}).click()
    const editor=page.locator('.workout-schedule-editor')
    await expect(editor).toBeVisible()

    await editor.locator('.workout-weekday-picker').getByRole('button',{name:'СР'}).click()
    await editor.locator('input[type="time"]').fill('07:30')
    await editor.getByRole('button',{name:'Сохранить расписание'}).click()

    await expect(editor).toHaveCount(0)
    const summary=page.locator('.workout-schedule-summary')
    await expect(summary).toContainText('Ср')
    await expect(summary).toContainText('07:30')
  })

  test('warmup row explains RIR and marks the exercise active after warmup only',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    const warmup=page.locator('.warmup-set-row')
    await expect(warmup.locator('.warmup-label strong')).toHaveText('Разм.')
    await expect(warmup.getByRole('button',{name:'Почему RIR не нужен в разминке'})).toBeVisible()
    await warmup.getByRole('button',{name:'Почему RIR не нужен в разминке'}).click()

    const sheet=page.locator('.workout-sheet')
    await expect(sheet).toContainText('Один разминочный подход по умолчанию')
    await expect(sheet).toContainText('50–60% рабочего веса')
    await sheet.locator('.drawer-head .icon-button').click()

    const inputs=warmup.locator('input')
    await inputs.nth(0).fill('15')
    await inputs.nth(1).fill('8')
    await warmup.locator('button.set-complete-button').click()
    await expect(warmup).toHaveClass(/is-completed/)

    await page.getByRole('button',{name:'Назад к упражнениям'}).click()
    const firstSummary=page.locator('.workout-exercise-summary').first()
    await expect(firstSummary).toHaveClass(/is-in-progress/)
    await expect(firstSummary).toContainText('Разм. ✓')
    await expect(firstSummary).toContainText('активно')
  })

  test('Meal Plan library is collapsed in Meal Plan and absent in calorie tracking',async({page})=>{
    await page.goto(preview+'/nutrition')
    await expect(page.locator('.client-nutrition-page')).toBeVisible()

    const library=page.locator('details.personal-meal-library')
    await expect(library).toHaveCount(1)
    await expect(library).not.toHaveAttribute('open','')

    await page.getByRole('button',{name:'Считать калории'}).click()
    await expect(page.locator('.nutrition-tracking-mode-copy h3')).toHaveText('Подсчёт калорий')
    await expect(page.locator('details.personal-meal-library')).toHaveCount(0)
  })

  test('Meal Plan targets cannot exceed the remaining calorie budget',async({page})=>{
    await page.goto(preview+'/nutrition')
    await page.getByRole('button',{name:'Редактировать Meal Plan'}).click()

    const editor=page.locator('.client-meal-plan-editor')
    const cards=editor.locator('.client-meal-edit-card')
    await expect(cards).toHaveCount(3)

    await cards.nth(0).getByTitle('Закрепить калорийность').click()
    await cards.nth(1).locator('.meal-accordion-toggle').click()
    await cards.nth(1).getByTitle('Закрепить калорийность').click()
    await cards.nth(2).locator('.meal-accordion-toggle').click()

    const lastRange=cards.nth(2).locator('.meal-target-control input[type="range"]')
    const lastNumber=cards.nth(2).locator('.meal-target-control input[type="number"]')
    const fixedMin=Number(await lastRange.getAttribute('min'))
    const fixedMax=Number(await lastRange.getAttribute('max'))
    expect(fixedMin).toBe(fixedMax)
    await expect(lastRange).toBeDisabled()
    await expect(lastNumber).toBeDisabled()

    await cards.nth(1).locator('.meal-accordion-toggle').click()
    await cards.nth(1).getByTitle('Калорийность закреплена').click()
    await cards.nth(2).locator('.meal-accordion-toggle').click()

    const dynamicMax=Number(await lastRange.getAttribute('max'))
    expect(dynamicMax).toBeGreaterThan(fixedMax)
    await lastNumber.fill('9999')
    await expect(lastNumber).toHaveValue(String(dynamicMax))

    const targets=await cards.locator('.meal-accordion-toggle small').allTextContents()
    const values=targets.map(text=>Number(text.match(/^(\d+) ккал/)?.[1]??0))
    expect(values.reduce((sum,value)=>sum+value,0)).toBe(2050)
  })

  test('unsaved nutrition check-in survives reload and clears after save',async({page})=>{
    await page.goto(recoveryPreview+'/nutrition')
    await page.getByRole('button',{name:'С отклонениями'}).click()
    await page.getByRole('button',{name:'Больше цели'}).click()
    await page.getByRole('button',{name:'Знаю цифры — указать ккал и белок'}).click()
    await page.getByLabel(/Ккал/).fill('2450')
    await page.getByLabel(/Белок, г/).fill('155')

    await page.reload()

    await expect(page.getByRole('button',{name:'С отклонениями'})).toHaveClass(/is-active/)
    await expect(page.getByRole('button',{name:'Больше цели'})).toHaveClass(/is-active/)
    await expect(page.getByLabel(/Ккал/)).toHaveValue('2450')
    await expect(page.getByLabel(/Белок, г/)).toHaveValue('155')

    await page.getByRole('button',{name:'Сохранить'}).click()
    await expect.poll(async()=>page.evaluate(()=>
      Object.keys(localStorage).filter(key=>key.startsWith('andrey-fit:nutrition-checkin-draft:')).length
    )).toBe(0)

    await page.reload()
    await expect(page.getByRole('button',{name:'С отклонениями'})).not.toHaveClass(/is-active/)
  })

  test('nutrition setup draft survives a full page reload',async({page})=>{
    await page.goto(nutritionSetupRecoveryPreview+'/nutrition')
    await page.getByRole('button',{name:'Изменить расчёт'}).click()

    await page.getByLabel('Рост, см').fill('181')
    await page.getByLabel('Вес, кг').fill('82.5')
    await page.getByLabel('Шагов в обычный день').fill('9000')
    await page.locator('label').filter({hasText:/^Обычный день/}).locator('select').selectOption('mixed')
    await page.getByLabel('Тренировок / неделю').first().fill('4')
    await page.getByLabel('Сессий / неделю').fill('2')
    await page.getByLabel('Темп').selectOption('lose_slow')

    await page.reload()

    await expect(page.locator('.nutrition-setup-form')).toBeVisible()
    await expect(page.getByLabel('Рост, см')).toHaveValue('181')
    await expect(page.getByLabel('Вес, кг')).toHaveValue('82.5')
    await expect(page.getByLabel('Шагов в обычный день')).toHaveValue('9000')
    await expect(page.locator('label').filter({hasText:/^Обычный день/}).locator('select')).toHaveValue('mixed')
    await expect(page.getByLabel('Тренировок / неделю').first()).toHaveValue('4')
    await expect(page.getByLabel('Сессий / неделю')).toHaveValue('2')
    await expect(page.getByLabel('Темп')).toHaveValue('lose_slow')
  })

  test('progress measurement drafts survive reload and clear after save',async({page})=>{
    await page.goto(recoveryPreview+'/progress')

    await page.locator('#progress-weight-input').fill('89.4')
    await page.locator('#progress-waist-input').fill('95.5')
    await page.locator('.quick-measure-note').fill('утром натощак')

    const monthlyPanel=page.locator('details.monthly-progress-panel')
    await monthlyPanel.locator('summary').click()
    await monthlyPanel.getByLabel('Грудь, см').fill('104')

    await page.reload()

    await expect(page.locator('#progress-weight-input')).toHaveValue('89.4')
    await expect(page.locator('#progress-waist-input')).toHaveValue('95.5')
    await expect(page.locator('.quick-measure-note')).toHaveValue('утром натощак')

    await monthlyPanel.locator('summary').click()
    await expect(monthlyPanel.getByLabel('Грудь, см')).toHaveValue('104')

    await page.locator('.quick-measure-actions .primary-button').click()
    await expect.poll(async()=>page.evaluate(()=>
      Object.keys(localStorage).filter(key=>key.startsWith('andrey-fit:progress-quick-draft:')).length
    )).toBe(0)

    await monthlyPanel.getByRole('button',{name:'Сохранить замеры'}).click()
    await expect.poll(async()=>page.evaluate(()=>
      Object.keys(localStorage).filter(key=>key.startsWith('andrey-fit:progress-monthly-measures-draft:')).length
    )).toBe(0)
  })

  test('progress self assessment draft survives reload and clears after save',async({page})=>{
    await page.goto(recoveryPreview+'/progress')

    const monthlyPanel=page.locator('details.monthly-progress-panel')
    await monthlyPanel.locator('summary').click()
    await monthlyPanel.getByRole('button',{name:'Пройти самооценку снова'}).click()

    const appearance=monthlyPanel.getByRole('group',{name:'Как нравится внешний вид'})
    await appearance.getByRole('button',{name:'9',exact:true}).click()
    await monthlyPanel.getByLabel('Что улучшить?').fill('Стабильнее ложиться спать')

    await page.reload()
    await monthlyPanel.locator('summary').click()

    await expect(monthlyPanel.getByRole('group',{name:'Как нравится внешний вид'}).getByRole('button',{name:'9',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(monthlyPanel.getByLabel('Что улучшить?')).toHaveValue('Стабильнее ложиться спать')

    await monthlyPanel.getByRole('button',{name:'Сохранить самооценку'}).click()
    await expect.poll(async()=>page.evaluate(()=>
      Object.keys(localStorage).filter(key=>key.startsWith('andrey-fit:progress-checkin-draft:')).length
    )).toBe(0)
  })

  test('progress sparse history does not present stale weight as the current 7-day average',async({page})=>{
    await page.goto(preview+'/progress')

    const averageCard=page.locator('.progress-summary-grid .stat-card').filter({hasText:'Средний вес · 7 дней'})
    await expect(averageCard.locator('.stat-value')).toHaveText('—')
    await expect(averageCard.locator('.stat-unit')).toContainText('сейчас 0/')

    const points=await page.locator('.progress-trend-panel .chart-wrap polyline').getAttribute('points')
    expect(points).toBeTruthy()
    const x=(points??'').split(' ').map(point=>Number(point.split(',')[0]))
    expect(x.length).toBeGreaterThanOrEqual(5)
    expect(x[0]).toBeCloseTo(0)
    expect(x[1]).toBeGreaterThan(27)
    expect(x.at(-1)).toBeCloseTo(100)

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })

  test('client can add a private reps-only exercise during a workout',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    await page.getByRole('button',{name:'Добавить своё упражнение'}).click()
    const sheet=page.locator('.add-custom-exercise-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Название').fill('Подъём коленей стоя')
    await sheet.getByLabel('Как считать').selectOption('reps_only')
    await sheet.getByLabel('Подходы').fill('2')
    await sheet.getByLabel('Повторы от').fill('12')
    await sheet.getByLabel('Повторы до').fill('15')
    await sheet.getByRole('button',{name:'Добавить в тренировку'}).click()

    await expect(page.getByRole('heading',{name:'Подъём коленей стоя'})).toBeVisible()
    await expect(page.locator('.exercise-focus-strategy')).toContainText('Добавлено вами · только эта тренировка')

    const header=page.locator('.exercise-focus-sets .live-set-row.header')
    await expect(header).toContainText('Повторы')
    await expect(header).not.toContainText('Вес')
    await expect(page.locator('.exercise-focus-sets .live-set-row:not(.header)')).toHaveCount(2)
    await expect(page.getByRole('button',{name:'Убрать из тренировки'})).toBeEnabled()
  })

  test('client can add a private weight-reps exercise and save a set',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    await page.getByRole('button',{name:'Добавить своё упражнение'}).click()
    const sheet=page.locator('.add-custom-exercise-sheet')
    await sheet.getByLabel('Название').fill('Тяга резинки к поясу')
    await sheet.getByLabel('Как считать').selectOption('weight_reps')
    await sheet.getByLabel('Оборудование').selectOption('band')
    await sheet.getByLabel('Подходы').fill('2')
    await sheet.getByLabel('Повторы от').fill('10')
    await sheet.getByLabel('Повторы до').fill('12')
    await sheet.getByRole('button',{name:'Добавить в тренировку'}).click()

    await expect(page.getByRole('heading',{name:'Тяга резинки к поясу'})).toBeVisible()
    const header=page.locator('.exercise-focus-sets .live-set-row.header')
    await expect(header).toContainText('Вес')
    await expect(header).toContainText('Повторы')

    const firstSet=page.locator('.exercise-focus-sets .live-set-row:not(.header)').first()
    const inputs=firstSet.locator('input')
    await inputs.nth(0).fill('12')
    await inputs.nth(1).fill('11')
    await firstSet.locator('select.rir-select').selectOption('2')
    await firstSet.locator('button.set-complete-button').click()

    await expect(firstSet).toHaveClass(/is-completed/)
    await expect(page.getByRole('button',{name:'Убрать из тренировки'})).toBeDisabled()
  })

  test('client can reuse an exercise from the personal list',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    await page.getByRole('button',{name:'Добавить своё упражнение'}).click()
    const sheet=page.locator('.add-custom-exercise-sheet')
    await sheet.getByLabel('Что добавить').selectOption({label:'Сгибание рук с резинкой'})

    await expect(sheet.getByLabel('Название')).toHaveCount(0)
    await expect(sheet.getByLabel('Отдых, сек')).toHaveValue('60')
    await expect(sheet.getByLabel('Заметка')).toHaveValue('Мой вариант для поездок')
    await expect(sheet.locator('.drawer-notice.neutral').filter({hasText:'Сгибание рук с резинкой'})).toContainText('вес × повторы')

    await sheet.getByRole('button',{name:'Добавить в тренировку'}).click()
    await expect(page.getByRole('heading',{name:'Сгибание рук с резинкой'})).toBeVisible()
    await expect(page.locator('.exercise-focus-strategy')).toContainText('Добавлено вами · только эта тренировка')
    await expect(page.locator('.exercise-focus-sets .live-set-row.header')).toContainText('Вес')
  })

  test('workout can switch exercise after a saved set without losing history',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    await expect(page.getByRole('button',{name:'Заменить',exact:true})).toBeEnabled()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('30')
    await inputs.nth(1).fill('10')
    await firstWorkSet.locator('select.rir-select').selectOption('2')
    await firstWorkSet.locator('button.set-complete-button').click()

    await expect(firstWorkSet).toHaveClass(/is-completed/)
    const switchButton=page.getByRole('button',{name:'Сменить упражнение',exact:true})
    await expect(switchButton).toBeEnabled()
    await expect(switchButton).toHaveAttribute('title','Выполненные подходы сохранятся; новое упражнение получит оставшиеся подходы.')

    await switchButton.click()
    const drawer=page.locator('.workout-sheet')
    await expect(drawer).toContainText('Выполненные подходы не пропадут')
    await drawer.getByRole('button',{name:/Жим штанги на наклонной скамье/}).click()
    await expect(drawer).toContainText('Как использовать эту замену?')
    await drawer.getByRole('button',{name:'Только сейчас',exact:true}).click()

    await expect(page.getByRole('heading',{name:'Жим штанги на наклонной скамье'})).toBeVisible()
    await expect(page.locator('.live-set-row:not(.header):not(.warmup-set-row)')).toHaveCount(2)
    const switchNotice=page.locator('.workout-switch-notice')
    await expect(switchNotice).toContainText('Продолжение после «Жим гантелей на наклонной скамье»')
    await expect(switchNotice).toContainText('1 подход сохранено в истории')
    await expect(switchNotice).toContainText('осталось выполнить 2 подхода')
    await expect(page.locator('.app-toast')).toContainText('Сохранённые подходы оставлены в истории')
  })

  test('workout substitution discards unsaved draft values from the old exercise',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('31')
    await inputs.nth(1).fill('9')

    await page.getByRole('button',{name:'Заменить',exact:true}).click()
    const drawer=page.locator('.workout-sheet')
    await drawer.getByRole('button',{name:/Жим штанги на наклонной скамье/}).click()
    await drawer.getByRole('button',{name:'Только сейчас',exact:true}).click()

    await expect(page.getByRole('heading',{name:'Жим штанги на наклонной скамье'})).toBeVisible()
    const replacedFirstSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first().locator('input')
    await expect(replacedFirstSet.nth(0)).toHaveValue('')
    await expect(replacedFirstSet.nth(1)).toHaveValue('')
  })

  test('workout substitution can be marked for future workouts',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    await page.getByRole('button',{name:'Заменить',exact:true}).click()
    const drawer=page.locator('.workout-sheet')
    await drawer.getByRole('button',{name:/Жим штанги на наклонной скамье/}).click()

    await expect(drawer.getByRole('button',{name:'В следующих тренировках тоже',exact:true})).toBeVisible()
    await drawer.getByRole('button',{name:'В следующих тренировках тоже',exact:true}).click()

    await expect(page.getByRole('heading',{name:'Жим штанги на наклонной скамье'})).toBeVisible()
    await expect(page.locator('.app-toast')).toContainText('будет использоваться в следующих тренировках')
  })

  test('saved workout set can be safely reopened, corrected and saved again',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('30')
    await inputs.nth(1).fill('10')
    await firstWorkSet.locator('select.rir-select').selectOption('2')
    await firstWorkSet.getByRole('button',{name:'Сохранить сет 1'}).click()

    await expect(firstWorkSet).toHaveClass(/is-completed/)
    await firstWorkSet.getByRole('button',{name:'Изменить сет 1'}).click()
    await expect(inputs.nth(0)).toBeEnabled()
    await expect(inputs.nth(0)).toHaveValue('30')
    await expect(inputs.nth(1)).toHaveValue('10')

    await inputs.nth(1).fill('11')
    await firstWorkSet.getByRole('button',{name:'Сохранить сет 1'}).click()
    await expect(firstWorkSet).toHaveClass(/is-completed/)
    await expect(inputs.nth(1)).toHaveValue('11')
  })

  test('workout set and cardio reject meaningless completion values',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    const cardio=page.locator('.live-cardio-card').first()
    await cardio.getByRole('button',{name:'Завершить кардио'}).click()
    await expect(page.locator('.app-toast')).toContainText('Укажи длительность кардио от 1 до 600 минут')

    const cardioInputs=cardio.locator('input')
    await cardioInputs.nth(0).fill('15')
    await cardio.getByRole('button',{name:'Завершить кардио'}).click()
    await expect(cardio.getByRole('button',{name:'Изменить результат'})).toBeVisible()
    await cardio.getByRole('button',{name:'Изменить результат'}).click()
    await expect(cardioInputs.nth(0)).toBeEnabled()
    await expect(cardioInputs.nth(0)).toHaveValue('15')

    await page.locator('.workout-exercise-summary').first().click()
    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const setInputs=firstWorkSet.locator('input')
    await setInputs.nth(0).fill('30')
    await setInputs.nth(1).fill('0')
    await firstWorkSet.getByRole('button',{name:'Сохранить сет 1'}).click()
    await expect(page.locator('.app-toast')).toContainText('количество повторов целым числом больше нуля')
    await expect(firstWorkSet).not.toHaveClass(/is-completed/)
  })

  test('unsaved workout set draft survives a full page reload',async({page})=>{
    await page.goto(recoveryPreview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('32.5')
    await inputs.nth(1).fill('9')
    await firstWorkSet.locator('select.rir-select').selectOption('1')

    await page.reload()

    await expect(page.getByRole('heading',{name:'Жим гантелей на наклонной скамье'})).toBeVisible()
    const restored=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    await expect(restored.locator('input').nth(0)).toHaveValue('32.5')
    await expect(restored.locator('input').nth(1)).toHaveValue('9')
    await expect(restored.locator('select.rir-select')).toHaveValue('1')
  })

  test('active workout exercise recovers when a reload loses the exercise deep link',async({page})=>{
    await page.goto(recoveryPreview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').nth(2).click()
    await expect(page.getByRole('heading',{name:'Жим ногами'})).toBeVisible()

    await expect.poll(async()=>page.evaluate(()=>{
      const raw=localStorage.getItem('andrey-fit:workout-recovery:preview-workout')
      if(!raw)return null
      return (JSON.parse(raw) as {ui?:{activeExerciseId?:string|null}}).ui?.activeExerciseId??null
    }),{timeout:3000}).toBe('we-leg')

    await page.evaluate(()=>{
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname+window.location.search+'#/workouts?workout=preview-workout',
      )
    })
    await page.reload()

    await expect(page).toHaveURL(/exercise=we-leg/)
    await expect(page.getByRole('heading',{name:'Жим ногами'})).toBeVisible()
  })

  test('rest timer keeps counting after a full page reload',async({page})=>{
    await page.goto(recoveryPreview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').nth(2).click()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('120')
    await inputs.nth(1).fill('12')
    await firstWorkSet.locator('select.rir-select').selectOption('2')
    await firstWorkSet.getByRole('button',{name:'Сохранить сет 1'}).click()

    const timer=page.locator('.rest-timer')
    await expect(timer).toBeVisible()
    await expect(timer).toContainText('Жим ногами')
    await expect(page.locator('.rest-timer-spacer')).toBeVisible()

    const timerBox=await timer.boundingBox()
    const navBox=await page.locator('.mobile-nav').boundingBox()
    expect(timerBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect((timerBox?.y??0)+(timerBox?.height??0)).toBeLessThanOrEqual((navBox?.y??0)+2)

    await page.waitForTimeout(900)
    const before=await timer.locator('strong').innerText()

    await page.reload()

    const restored=page.locator('.rest-timer')
    await expect(restored).toBeVisible()
    await expect(restored).toContainText('Жим ногами')
    const after=await restored.locator('strong').innerText()
    const seconds=(value:string)=>{
      const [minutes,secs]=value.split(':').map(Number)
      return minutes*60+secs
    }
    expect(seconds(after)).toBeGreaterThan(0)
    expect(seconds(after)).toBeLessThanOrEqual(seconds(before))
  })

  test('completed exercise leaves the active list and moves into the completed group',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    const firstSummary=page.locator('.workout-exercise-summary').first()
    const exerciseName=(await firstSummary.locator('.workout-exercise-summary-copy strong').innerText()).replace(/^[A-Z]\d · /,'')
    await firstSummary.click()

    const finishButton=page.getByRole('button',{name:'Завершить упражнение'})
    await expect(finishButton).toBeDisabled()
    await expect(page.getByText('Сначала заверши хотя бы один рабочий подход.')).toBeVisible()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('30')
    await inputs.nth(1).fill('10')
    await firstWorkSet.locator('select.rir-select').selectOption('2')
    await firstWorkSet.locator('button.set-complete-button').click()

    await expect(finishButton).toBeEnabled()
    await finishButton.click()

    const completed=page.locator('details.completed-exercises-group')
    await expect(completed).toBeVisible()
    await expect(completed).not.toHaveAttribute('open','')
    await expect(completed.locator('summary')).toContainText('Завершённые упражнения')
    await expect(completed.locator('summary strong')).toHaveText('1')

    await completed.locator('summary').click()
    const completedCard=completed.locator('.workout-exercise-summary.is-completed').filter({hasText:exerciseName})
    await expect(completedCard).toBeVisible()
    await expect(completedCard).toContainText('готово')
    await completedCard.click()

    await expect(page.getByRole('heading',{name:exerciseName})).toBeVisible()
    await expect(page.locator('.exercise-completed-panel')).toContainText('Упражнение завершено')
  })

  test('saving a superset set never auto-navigates to its partner',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    const firstExercise=page.locator('.workout-exercise-summary').first()
    await firstExercise.click()

    await expect(page.locator('.superset-manual-hint')).toContainText('После этого упражнения сразу переходи')
    const exerciseUrl=page.url()

    const firstWorkSet=page.locator('.live-set-row:not(.header):not(.warmup-set-row)').first()
    const inputs=firstWorkSet.locator('input')
    await inputs.nth(0).fill('30')
    await inputs.nth(1).fill('10')
    await firstWorkSet.locator('select.rir-select').selectOption('2')
    await firstWorkSet.locator('button.set-complete-button').click()

    await expect(firstWorkSet).toHaveClass(/is-completed/)
    await expect(page).toHaveURL(exerciseUrl)
    await expect(page.locator('.superset-manual-hint')).toBeVisible()
  })

  test('workout can be explicitly completed with unfinished items and then resumed',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    await page.getByRole('button',{name:'Завершить тренировку'}).click()
    const sheet=page.locator('.finish-workout-sheet')
    await expect(sheet).toContainText('Не завершено')
    await sheet.getByLabel(/Комментарий тренеру/).fill('QA: завершил раньше')
    await sheet.getByRole('button',{name:'Завершить',exact:true}).click()

    await expect(page.getByRole('button',{name:'Возобновить тренировку'})).toBeVisible()
    await expect(page.locator('.workout-session-comment')).toContainText('QA: завершил раньше')

    await page.getByRole('button',{name:'Возобновить тренировку'}).click()
    await expect(page.getByRole('button',{name:'Завершить тренировку'})).toBeVisible()
  })

  test('client can send an exercise comment from the live workout',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()
    await page.locator('.workout-exercise-summary').first().click()
    await page.getByRole('button',{name:'Комментарии',exact:true}).click()

    const sheet=page.locator('.workout-sheet')
    await sheet.getByPlaceholder(/на втором сете/).fill('На втором сете тянет плечо')
    await sheet.getByRole('button',{name:'Отправить тренеру'}).click()

    await expect(sheet.locator('.inline-action-notice')).toContainText('Сообщение отправлено тренеру')
    await expect(sheet).toContainText('На втором сете тянет плечо')
  })

  test('notification action opens the intended client context',async({page})=>{
    await page.goto(preview+'/notifications')
    const nutrition=page.locator('.notification-item').filter({hasText:'Пора записать питание'})
    await nutrition.getByTitle('Открыть').click()
    await expect(page).toHaveURL(/#\/nutrition$/)
    await expect(page.locator('.client-nutrition-page')).toBeVisible()
  })

  test('repeated self-assessment starts blank without previous-answer cues',async({page})=>{
    await page.goto(preview+'/progress')
    const panel=page.locator('details.monthly-progress-panel')
    if(!(await panel.evaluate((node:HTMLDetailsElement)=>node.open))){
      await panel.locator('summary').click()
    }

    await page.getByRole('button',{name:'Пройти самооценку снова'}).click()

    await expect(panel.locator('.monthly-score-scale button.is-selected')).toHaveCount(0)
    await expect(panel.locator('.monthly-previous-score')).toHaveCount(0)

    const textareas=panel.locator('.monthly-text-grid textarea')
    await expect(textareas).toHaveCount(4)
    for(let i=0;i<4;i++)await expect(textareas.nth(i)).toHaveValue('')

    await panel.getByRole('group',{name:'Как нравится внешний вид'}).getByRole('button',{name:'9',exact:true}).click()
    await textareas.nth(0).fill('Новый независимый ответ')
    await panel.getByRole('button',{name:'Отмена'}).click()

    await expect(panel.getByRole('button',{name:'Пройти самооценку снова'})).toBeVisible()
    await panel.getByRole('button',{name:'Пройти самооценку снова'}).click()
    await expect(panel.locator('.monthly-score-scale button.is-selected')).toHaveCount(0)
    await expect(textareas.nth(0)).toHaveValue('')
  })

  test('main client routes render without fatal fallback or horizontal overflow',async({page})=>{
    for(const route of ['/','/nutrition','/workouts','/progress','/useful','/useful/body-composition','/settings','/settings/profile','/settings/notifications','/settings/personalization','/settings/app']){
      await page.goto(preview+route)
      await expect(page.locator('body')).not.toContainText('Что-то пошло не так')
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(2)
    }
  })
})


const trainerPreview='/?qa=trainer-preview-20261006#'
const trainerPwaPreview='/?app=trainer&qa=trainer-preview-20261006#'

test.describe('trainer preview critical behavior',()=>{
  test('trainer PWA selects the trainer manifest and identity',async({page})=>{
    await page.goto(trainerPwaPreview+'/settings')
    await expect(page.locator('.settings-page')).toBeVisible()
    await expect(page).toHaveTitle(/Andrey-Fit Trainer/)

    const manifest=await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifest).toContain('/manifest-trainer.json')
    expect(await page.evaluate(()=>window.__andreyFitPwaVariant)).toBe('trainer')
  })

  test('trainer routes render without fatal fallback or horizontal overflow',async({page})=>{
    const routes=['/','/clients','/clients/sergey','/builder','/builder/exercises','/builder/programs/new','/builder/replacements','/builder/nutrition/new','/builder/nutrition/preview-draft/edit','/inbox','/notifications','/settings','/trainer']
    for(const route of routes){
      await page.goto(trainerPreview+route)
      await expect(page.locator('body')).not.toContainText('Что-то пошло не так')
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
      expect(overflow,route).toBeLessThanOrEqual(2)
    }
  })

  test('trainer can complete preview client-creation flow',async({page})=>{
    await page.goto(trainerPreview+'/clients')
    await page.getByRole('button',{name:'Добавить клиента'}).click()

    const sheet=page.locator('.managed-client-sheet')
    await expect(sheet).toBeVisible()
    await sheet.locator('label').filter({hasText:/^Имя/}).locator('input').fill('Тестовый клиент')
    await sheet.locator('label').filter({hasText:/^Возраст/}).locator('input').fill('31')
    await sheet.getByRole('button',{name:'Создать клиента'}).click()

    const result=page.locator('.access-credentials-card')
    await expect(result).toBeVisible()
    await expect(result).toContainText('Доступ готов')
    await expect(result.locator('input').nth(1)).not.toHaveValue('')
    await expect(result.locator('input').nth(2)).not.toHaveValue('')
  })

  test('trainer can reply to a client thread and resolve it',async({page})=>{
    await page.goto(trainerPreview+'/inbox')
    const initialThread=page.locator('.inbox-thread').first()
    await initialThread.getByPlaceholder('Коротко ответить клиенту…').fill('Снизь вес и оставь 2 RIR')
    await initialThread.getByRole('button',{name:'Ответить'}).click()

    await page.getByRole('button',{name:/В работе/}).click()
    const workingThread=page.locator('.inbox-thread').filter({hasText:'Снизь вес и оставь 2 RIR'}).first()
    await expect(workingThread).toBeVisible()
    await expect(workingThread).toHaveClass(/in_progress/)
    await workingThread.getByRole('button',{name:'Решено'}).click()

    await page.locator('.inbox-tabs').getByRole('button',{name:/Решено/}).click()
    await expect(page.locator('.inbox-thread').filter({hasText:'Снизь вес и оставь 2 RIR'}).first()).toHaveClass(/resolved/)
  })

  test('trainer edits an active Meal Plan as a draft revision',async({page})=>{
    await page.goto(trainerPreview+'/clients/sergey')
    await page.getByRole('button',{name:'Изменить Meal Plan'}).click()
    await expect(page).toHaveURL(/\/builder\/nutrition\/preview-revision\/edit/)
    await expect(page.locator('.nutrition-builder-page')).toBeVisible()
    await expect(page.locator('.nutrition-plan-basics input').first()).toHaveValue('Базовый рацион')
  })

  test('trainer edits an active program as a new version',async({page})=>{
    await page.goto(trainerPreview+'/builder')
    const activeRow=page.locator('.trainer-program-row.is-active').first()
    await activeRow.getByRole('link',{name:'Редактировать'}).click()
    await expect(page).toHaveURL(/\/builder\/programs\/preview-program-active\/edit/)
    await expect(page.getByRole('heading',{name:'Редактирование программы'})).toBeVisible()

    const items=page.locator('.exercise-program-item')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0).locator('h3')).toHaveText('Жим гантелей на наклонной скамье')

    await items.nth(0).getByRole('button',{name:'Опустить упражнение'}).click()
    await expect(items.nth(0).locator('h3')).toHaveText('Горизонтальная тяга в блочном тренажёре')

    await items.nth(0).getByRole('button',{name:'Заменить упражнение'}).click()
    const picker=page.locator('.program-picker')
    await expect(picker.getByRole('heading',{name:'Заменить упражнение'})).toBeVisible()
    await picker.getByRole('button',{name:/Отведение руки в сторону с нижнего блока/}).click()
    await expect(items.nth(0).locator('h3')).toHaveText('Отведение руки в сторону с нижнего блока')

    await page.locator('.program-add-bar .primary-button').click()
    await page.locator('.program-picker').getByRole('button',{name:/Жим гантелей на наклонной скамье/}).click()
    await expect(items).toHaveCount(4)

    await items.nth(3).evaluate(node=>node.scrollIntoView({block:'center'}))
    await items.nth(3).getByRole('button',{name:'Удалить упражнение'}).click()
    await expect(items).toHaveCount(3)

    await items.nth(0).getByRole('button',{name:'Объединить в суперсет'}).click()
    await items.nth(1).getByRole('button',{name:'Объединить сюда'}).click()
    await expect(page.locator('.program-superset-label')).toHaveCount(1)
    await expect(items.nth(0)).toContainText('Суперсет · упражнение 1 из 2')
    await expect(items.nth(1)).toContainText('Суперсет · упражнение 2 из 2')
    await expect(page.getByText('A1',{exact:true})).toHaveCount(0)
    await expect(page.getByText('A2',{exact:true})).toHaveCount(0)

    await page.getByRole('button',{name:'Сохранить новую версию'}).click()
    await expect(page.getByRole('button',{name:'Опубликовать клиенту'})).toBeEnabled()
    await page.getByRole('button',{name:'Опубликовать клиенту'}).click()
    await expect(page.getByRole('button',{name:'Опубликована'})).toBeVisible()
  })

  test('trainer builder preview is deterministic',async({page})=>{
    await page.goto(trainerPreview+'/builder')
    await expect(page.getByText('Full Body · Сергей',{exact:true})).toBeVisible()
    await expect(page.getByRole('link',{name:/Создать программу/}).first()).toBeVisible()
    await expect(page.getByRole('link',{name:/Планы питания/}).first()).toBeVisible()
    await expect(page.getByRole('link',{name:/Упражнения/}).first()).toBeVisible()
    await expect(page.getByRole('link',{name:/Замены/}).first()).toBeVisible()
  })
})
