import { expect, test } from '@playwright/test'

const preview='/\?qa=client-preview-20261005#'

test.describe('client preview critical behavior',()=>{
  test('Meal Plan library is collapsed in Meal Plan and absent in calorie tracking',async({page})=>{
    await page.goto(preview+'/nutrition')
    await expect(page.getByRole('heading',{name:'Питание'}).or(page.getByText('Режим питания'))).toBeVisible()

    const library=page.locator('details.personal-meal-library')
    await expect(library).toHaveCount(1)
    await expect(library).not.toHaveAttribute('open','')

    await page.getByRole('button',{name:'Считать калории'}).click()
    await expect(page.getByText('Подсчёт калорий',{exact:true})).toBeVisible()
    await expect(page.locator('details.personal-meal-library')).toHaveCount(0)
  })

  test('saving a superset set never auto-navigates to its partner',async({page})=>{
    await page.goto(preview+'/workouts')
    await page.getByRole('button',{name:'Продолжить'}).click()

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

  test('main client routes render without fatal fallback or horizontal overflow',async({page})=>{
    for(const route of ['/','/nutrition','/workouts','/progress','/settings']){
      await page.goto(preview+route)
      await expect(page.locator('body')).not.toContainText('Что-то пошло не так')
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(2)
    }
  })
})
