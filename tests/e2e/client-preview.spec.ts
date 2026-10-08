
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

    await page.getByRole('button',{name:/Решено/}).click()
    await expect(page.locator('.inbox-thread').filter({hasText:'Снизь вес и оставь 2 RIR'}).first()).toHaveClass(/resolved/)
  })

  test('trainer edits an active Meal Plan as a draft revision',async({page})=>{
    await page.goto(trainerPreview+'/clients/sergey')
    await page.getByRole('button',{name:'Изменить Meal Plan'}).click()
    await expect(page).toHaveURL(/\/builder\/nutrition\/preview-revision\/edit/)
    await expect(page.locator('.nutrition-builder-page')).toBeVisible()
    await expect(page.locator('.nutrition-plan-basics input').first()).toHaveValue('Базовый рацион')