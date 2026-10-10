const CDP=require('chrome-remote-interface')
const fs=require('fs')
const path=require('path')

const ORIGIN=process.env.VISUAL_QA_ORIGIN||'http://127.0.0.1:4173'
const OUT=process.env.VISUAL_QA_OUT||'artifacts/mobile-trainer'
const VIEW={width:393,height:873,deviceScaleFactor:2.75,mobile:true}

fs.mkdirSync(path.join(OUT,'viewport'),{recursive:true})
fs.mkdirSync(path.join(OUT,'full'),{recursive:true})
const shots=[]
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))

async function main(){
  const target=await CDP.New({url:'about:blank'})
  const client=await CDP({target})
  const {Page,Runtime,Network,Emulation}=client
  await Page.enable();await Runtime.enable();await Network.enable()
  await Emulation.setDeviceMetricsOverride(VIEW)
  await Emulation.setTouchEmulationEnabled({enabled:true,maxTouchPoints:5})
  await Network.setUserAgentOverride({
    userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    platform:'Android',
  })
  await Emulation.setEmulatedMedia({media:'screen',features:[{name:'prefers-reduced-motion',value:'reduce'}]})

  async function evaluate(expression){
    const result=await Runtime.evaluate({expression,awaitPromise:true,returnByValue:true})
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'Runtime evaluate failed')
    return result.result.value
  }

  async function waitReady(extra=650){
    for(let i=0;i<60;i++){
      if(await evaluate(`document.readyState==='complete'&&!!document.querySelector('#root')`))break
      await sleep(100)
    }
    await evaluate(`(()=>{window.scrollTo(0,0);const s=document.createElement('style');s.id='visual-qa-style';s.textContent='*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}';if(!document.getElementById(s.id))document.head.appendChild(s)})()`)
    await sleep(extra)
  }

  async function go(route){
    const url=`${ORIGIN}/?visual=trainer#${route}`
    const loaded=new Promise(resolve=>Page.loadEventFired(resolve))
    await Page.navigate({url})
    await Promise.race([loaded,sleep(5000)])
    await waitReady()
    await assertHealthy(route)
  }

  async function assertHealthy(route){
    const health=await evaluate(`(()=>({text:document.body.innerText||'',overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,main:!!document.querySelector('main')}))()`)
    if(health.text.includes('Что-то пошло не так'))throw new Error('Fatal fallback on '+route)
    if(health.overflow>2)throw new Error('Horizontal overflow '+health.overflow+'px on '+route)
    if(!health.main)throw new Error('Main content missing on '+route)
  }

  async function clickText(text){
    const ok=await evaluate(`(()=>{const e=[...document.querySelectorAll('button,a,summary')].find(el=>(el.textContent||'').trim().includes(${JSON.stringify(text)}));if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true})()`)
    if(ok)await sleep(450)
    return ok
  }

  async function screenshot(name,title){
    await evaluate('window.scrollTo(0,0)')
    await sleep(120)
    const view=await Page.captureScreenshot({format:'png',fromSurface:true})
    fs.writeFileSync(path.join(OUT,'viewport',name+'.png'),Buffer.from(view.data,'base64'))

    const metrics=await Page.getLayoutMetrics()
    const width=Math.max(VIEW.width,Math.ceil(metrics.cssContentSize?.width||metrics.contentSize?.width||VIEW.width))
    const height=Math.max(VIEW.height,Math.ceil(metrics.cssContentSize?.height||metrics.contentSize?.height||VIEW.height))
    const full=await Page.captureScreenshot({
      format:'png',fromSurface:true,captureBeyondViewport:true,
      clip:{x:0,y:0,width,height,scale:1},
    })
    fs.writeFileSync(path.join(OUT,'full',name+'.png'),Buffer.from(full.data,'base64'))

    const state=await evaluate(`({url:location.href,title:document.title,text:(document.querySelector('main')?.innerText||document.body.innerText||'').slice(0,700)})`)
    shots.push({name,title,...state})
    console.log('captured',name,state.url)
  }

  async function captureRoute(name,title,route){
    await go(route)
    await screenshot(name,title)
  }

  await captureRoute('00-dashboard','Главная тренера','/')
  await captureRoute('01-clients','Клиенты','/clients')
  if(await clickText('Добавить клиента')){
    await assertHealthy('/clients · add client')
    await screenshot('02-client-create','Клиенты · создание клиента')
  }

  await captureRoute('03-client-workspace','Карточка клиента','/clients/sergey')
  await captureRoute('04-builder','Builder','/builder')
  await captureRoute('05-exercise-library','Библиотека упражнений','/builder/exercises')
  await captureRoute('06-program-create','Конструктор программы','/builder/programs/new')
  await captureRoute('07-program-edit','Редактирование действующей программы','/builder/programs/preview-program-active/edit')
  await captureRoute('08-replacements','Группы замен','/builder/replacements')
  await captureRoute('09-nutrition-builder','Конструктор питания','/builder/nutrition/new')
  await captureRoute('10-inbox','Inbox','/inbox')
  await captureRoute('11-notifications','Уведомления тренера','/notifications')
  await captureRoute('12-settings','Настройки тренера','/settings')
  await captureRoute('13-profile','Профиль тренера','/trainer')

  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({
    generatedAt:new Date().toISOString(),
    viewport:VIEW,
    role:'trainer',
    shots,
  },null,2))

  fs.writeFileSync(path.join(OUT,'README.md'),[
    '# Andrey-Fit mobile trainer visual QA','',
    `Viewport: ${VIEW.width}×${VIEW.height}, Android Chrome emulation.`,'',
    ...shots.map(s=>`- **${s.title}** — \`viewport/${s.name}.png\` · \`full/${s.name}.png\``),'',
  ].join('\n'))

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
  const cards=shots.map(s=>`<section><h2>${esc(s.title)}</h2><p><code>${esc(s.url)}</code></p><img src="full/${s.name}.png" alt="${esc(s.title)}"></section>`).join('\n')
  fs.writeFileSync(path.join(OUT,'gallery.html'),`<!doctype html><meta charset="utf-8"><title>Andrey-Fit trainer mobile visual QA</title><style>body{font-family:system-ui;margin:0;background:#eef1f4;color:#111827}main{max-width:920px;margin:auto;padding:24px}section{background:#fff;border-radius:18px;padding:18px;margin:0 0 24px;box-shadow:0 4px 20px #0001}h2{font-size:20px;margin:0 0 8px}p{overflow-wrap:anywhere;color:#667085}img{display:block;width:min(393px,100%);height:auto;margin:auto;border:1px solid #d0d5dd;border-radius:14px}</style><main><h1>Andrey-Fit · mobile trainer visual QA</h1>${cards}</main>`)

  await client.close()
  await CDP.Close({id:target.id})
}

main().catch(error=>{console.error(error);process.exit(1)})
