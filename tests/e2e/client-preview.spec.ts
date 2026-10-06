import { expect, test } from '@playwright/test'

const preview='/\?qa=client-preview-20261005#'

test.describe('client preview critical behavior',()=>{
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

    const values=await cards.locator('.meal-target-control input[type="number"]').evaluateAll(nodes=>nodes.map(node=>Number((node as HTMLInputElement).value)))
    expect(values.reduce((sum,value)=>sum+value,0)).toBe(2050)
  })

  test('saving a superset set never auto-navigates to its partner',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.locator('.recent-completed-workout.is-clickable .primary-button').click()

    const firstExercise=page.locator('.workout-exercise-summary').first()
    await firstExercise.click()

    await expect(page.locator('.superset-manual-hint')).toContainText('Чередуй упражнения вручную')
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
    for(const route of ['/','/nutrition','/workouts','/progress','/settings']){
      await page.goto(preview+route)
      await expect(page.locator('body')).not.toContainText('Что-то пошло не так')
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(2)
    }
  })
})


const trainerPreview='/?qa=trainer-preview-20261006#'

test.describe('trainer preview critical behavior',()=>{
  test('trainer routes render without fatal fallback or horizontal overflow',async({page})=>{
    const routes=['/','/clients','/clients/sergey','/builder','/builder/exercises','/builder/programs/new','/builder/replacements','/builder/nutrition/new','/inbox','/notifications','/settings','/trainer']
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

    await items.nth(3).getByRole('button',{name:'Удалить упражнение'}).click()
    await expect(items).toHaveCount(3)

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
