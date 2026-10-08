import { expect, test } from '@playwright/test'

const clientPreview='/?qa=client-preview-20261005#'
const trainerPreview='/?qa=trainer-preview-20261006#'

test.describe('signed-out and role auth gates',()=>{
  test('public root renders the client login surface',async({page})=>{
    await page.goto('/#/')
    await expect(page.getByRole('heading',{name:'Войти в Andrey-Fit'})).toBeVisible()
    await expect(page.getByRole('heading',{name:'Вход тренера'})).toHaveCount(0)
    await expect(page.locator('.trainer-access-link')).toContainText('Вход для тренера')
  })

  test('trainer access renders only the trainer login surface',async({page})=>{
    await page.goto('/#/trainer-access')
    await expect(page.getByRole('heading',{name:'Вход тренера'})).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Пароль')).toBeVisible()
    await expect(page.getByRole('button',{name:'Войти в кабинет'})).toBeVisible()
  })

  test('trainer PWA start route renders the trainer login surface',async({page})=>{
    await page.goto('/?app=trainer#/trainer-access')
    await expect(page.getByRole('heading',{name:'Вход тренера'})).toBeVisible()
    await expect(page).toHaveTitle(/Andrey-Fit Trainer/)
  })

  test('client role cannot enter trainer access',async({page})=>{
    await page.goto(clientPreview+'/trainer-access')
    await expect(page.getByText('Доступ запрещён')).toBeVisible()
    await expect(page.getByText('Этот адрес предназначен только для кабинета тренера.')).toBeVisible()
  })

  test('trainer role is redirected away from client-only routes',async({page})=>{
    await page.goto(trainerPreview+'/nutrition')
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByRole('heading',{name:'Кабинет тренера'})).toBeVisible()
    await expect(page.locator('.client-nutrition-page')).toHaveCount(0)
  })
})
