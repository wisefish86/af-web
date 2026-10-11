import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthLoadingScreen } from './components/AuthLoadingScreen'
import { LoginPage } from './pages/LoginPage'
import { TrainerLoginPage } from './pages/TrainerLoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NutritionPage } from './pages/NutritionPage'
import { WorkoutsPage } from './pages/WorkoutsPage'
import { ProgressPage } from './pages/ProgressPage'
import { AdminPage } from './pages/AdminPage'
import { TrainerHomePage } from './pages/TrainerHomePage'
import { BuilderPage } from './pages/BuilderPage'
import { ExerciseLibraryPage } from './pages/ExerciseLibraryPage'
import { ProgramBuilderPage } from './pages/ProgramBuilderPage'
import { ReplacementGroupsPage } from './pages/ReplacementGroupsPage'
import { ClientWorkspacePage } from './pages/ClientWorkspacePage'
import { SettingsPage } from './pages/SettingsPage'
import { SettingsHubPage } from './pages/SettingsHubPage'
import { UsefulPage } from './pages/UsefulPage'
import { BodyCompositionPage } from './pages/BodyCompositionPage'
import { InboxPage } from './pages/InboxPage'
import { NutritionBuilderPage } from './pages/NutritionBuilderPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { TrainerProfilePage } from './pages/TrainerProfilePage'
import { FirstAccessSetupPage } from './pages/FirstAccessSetupPage'
import { TelegramConnectPage } from './pages/TelegramConnectPage'
import { authenticateTelegramMiniApp, bindOwnerTelegram } from './features/telegram/service'
import { getTelegramWebApp, isTelegramMiniApp, prepareTelegramMiniApp, type TelegramMiniAppUser } from './lib/telegram'
import { supabase } from './lib/supabase'
import { getAppBaseUrl } from './lib/appUrl'
import { appDateKey, setAppTimeZone } from './lib/appDate'
import type { UserRole } from './lib/types'
import { currentPwaVariant } from './lib/pwaInstall'

type AppState = {
  authenticated: boolean
  preview: boolean
  role: UserRole
  name: string
  enabledModules: string[]
  accessSetupRequired:boolean
}

const initial: AppState = {
  authenticated: false,
  preview: false,
  role: 'client',
  name: 'Сергей',
  enabledModules: [],
  accessSetupRequired:false,
}

const previewClientModules = ['nutrition', 'training', 'progress', 'checkins', 'notifications']

async function withTimeout<T>(promise:PromiseLike<T>,message:string,ms=12000):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(message)),ms)}),
    ])
  }finally{
    if(timer!==undefined)window.clearTimeout(timer)
  }
}

export default function App() {
  const pageParams=new URLSearchParams(window.location.search)
  const qaClientPreview=pageParams.get('visual')==='client'||pageParams.get('qa')==='client-preview-20261005'
  const qaTrainerPreview=pageParams.get('visual')==='trainer'||pageParams.get('qa')==='trainer-preview-20261006'
  const qaPreview=qaClientPreview||qaTrainerPreview
  const telegramMode=isTelegramMiniApp()
  const location=useLocation()
  const currentPath=location.pathname||'/'
  const trainerPwa=currentPwaVariant()==='trainer'
  const trainerAccessPath=currentPath==='/trainer-access'
  const [state, setState] = useState<AppState>(()=>qaTrainerPreview?{
    authenticated:true,preview:true,role:'trainer',name:'Андрей',
    enabledModules:[],accessSetupRequired:false,
  }:qaClientPreview?{
    authenticated:true,preview:true,role:'client',name:'Сергей',
    enabledModules:previewClientModules,accessSetupRequired:false,
  }:initial)
  const [authReady,setAuthReady]=useState(qaPreview)
  const [authIssue,setAuthIssue]=useState('')
  const [telegramStatus,setTelegramStatus]=useState<'idle'|'checking'|'ready'|'unlinked'|'error'>(telegramMode?'checking':'idle')
  const [telegramUser,setTelegramUser]=useState<TelegramMiniAppUser|null>(null)
  const [telegramIssue,setTelegramIssue]=useState('')
  const [telegramTestClient,setTelegramTestClient]=useState(false)

  useEffect(() => {
    if(qaPreview)return
    const client=supabase
    if (!client) {
      setAuthReady(true)
      return
    }

    let cancelled=false
    let unsubscribe:(()=>void)|undefined

    const startAuthListener=()=>{
      const {data:listener}=client.auth.onAuthStateChange((event,session)=>{
        if(cancelled)return
        // bootstrap already handled the existing session. Re-reading profile/modules
        // on INITIAL_SESSION or a routine token refresh only adds network latency.
        if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return
        if(session){
          void loadProfile(session.user.id).finally(()=>{
            if(!cancelled)setAuthReady(true)
          })
        }else{
          setState(initial)
          setAuthIssue('')
          if(telegramMode){
            setTelegramStatus('error')
            setTelegramIssue('Сессия завершена. Закрой Mini App и открой его снова из Telegram.')
          }
          setAuthReady(true)
        }
      })
      unsubscribe=()=>listener.subscription.unsubscribe()
    }

    const bootstrap=async()=>{
      if(telegramMode){
        prepareTelegramMiniApp()
        setTelegramStatus('checking')
        setTelegramIssue('')
        try{
          const result=await authenticateTelegramMiniApp()
          if(cancelled)return
          if(result.status==='unlinked'){
            setTelegramUser(result.user)
            setTelegramStatus('unlinked')
            setAuthReady(true)
            return
          }
          if(result.status==='blocked'){
            const text=result.reason==='paused'
              ?'Сопровождение временно заморожено. Свяжись с тренером.'
              :result.reason==='finished'
                ?'Сопровождение завершено. Данные сохранены у тренера.'
                :'Доступ к сопровождению сейчас закрыт.'
            setTelegramStatus('error')
            setTelegramIssue(text)
            setAuthReady(true)
            return
          }

          await loadProfile(result.userId)
          if(cancelled)return
          setTelegramTestClient(result.testOwner)
          setTelegramStatus('ready')
          setAuthReady(true)
          startAuthListener()
          return
        }catch(error){
          if(cancelled)return
          setTelegramStatus('error')
          setTelegramIssue(error instanceof Error?error.message:'Не удалось выполнить вход через Telegram.')
          setAuthReady(true)
          return
        }
      }

      const {data,error}=await client.auth.getSession()
      if(cancelled)return
      if(error){
        setAuthIssue('Не удалось проверить текущий вход. Проверь соединение и попробуй ещё раз.')
        setAuthReady(true)
        return
      }

      if(data.session)await loadProfile(data.session.user.id)
      if(cancelled)return

      setAuthReady(true)
      startAuthListener()
    }

    void bootstrap()
    return ()=>{
      cancelled=true
      unsubscribe?.()
    }
  }, [telegramMode])

  useEffect(()=>{
    const onName=(event:Event)=>{
      const name=(event as CustomEvent<{name?:string}>).detail?.name?.trim()
      if(name)setState(current=>({...current,name}))
    }
    window.addEventListener('andrey-fit-profile-name-changed',onName)
    return()=>window.removeEventListener('andrey-fit-profile-name-changed',onName)
  },[])

  useEffect(()=>{
    if(!authReady)return

    let cancelled=false
    const reveal=async()=>{
      if(document.readyState!=='complete'){
        await new Promise<void>(resolve=>window.addEventListener('load',()=>resolve(),{once:true}))
      }

      const initialPath=(window.location.hash.replace(/^#/,'').split('?')[0]||'/')
      const bootWindow=window as Window & {__andreyFitPageReady?:boolean}
      if(initialPath==='/'&&state.authenticated&&state.role==='client'&&!bootWindow.__andreyFitPageReady){
        await new Promise<void>(resolve=>{
          let settled=false
          const done=()=>{
            if(settled)return
            settled=true
            window.removeEventListener('andrey-fit-page-ready',done)
            resolve()
          }
          window.addEventListener('andrey-fit-page-ready',done,{once:true})
          window.setTimeout(done,2500)
        })
      }

      if(document.fonts?.ready){
        try{await document.fonts.ready}catch{}
      }
      if(cancelled)return
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(!cancelled)document.documentElement.classList.add('app-ready')
      }))
    }

    void reveal()
    return ()=>{cancelled=true}
  },[authReady,state.authenticated,state.role])

  async function loadProfile(userId: string) {
    if (!supabase) return

    const hashQuery = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      : new URLSearchParams()
    const pageQuery = new URLSearchParams(window.location.search)
    const inviteFromUrl=hashQuery.get('invite')||pageQuery.get('invite')
    const pendingInvite=inviteFromUrl||localStorage.getItem('andrey-fit-pending-client-invite')
    const pendingTrainer = localStorage.getItem('andrey-fit-pending-trainer-bootstrap') === '1' || hashQuery.get('bootstrap') === '1' || pageQuery.get('bootstrap') === '1'

    if (pendingTrainer) {
      const { error } = await supabase.rpc('claim_initial_trainer')
      if (error) {
        setAuthIssue('Не удалось активировать кабинет тренера: '+error.message)
        return
      }
      localStorage.removeItem('andrey-fit-pending-trainer-bootstrap')
    }

    let inviteAccepted=false
    if (pendingInvite) {
      const { error } = await supabase.rpc('accept_client_invite',{p_token:pendingInvite})
      if (error) {
        const invalidInvite=
          error.message.includes('expired')||
          error.message.includes('revoked')||
          error.message.includes('already been used')||
          error.message.includes('not found')
        if(invalidInvite)localStorage.removeItem('andrey-fit-pending-client-invite')
        const message=error.message.includes('expired')?'Срок приглашения истёк. Попроси тренера прислать новую ссылку.'
          :error.message.includes('revoked')?'Приглашение было отозвано тренером.'
          :error.message.includes('already been used')?'Это приглашение уже использовано другим аккаунтом.'
          :error.message.includes('not found')?'Ссылка-приглашение недействительна.'
          :'Не удалось принять приглашение: '+error.message
        setAuthIssue(message)
        return
      }
      localStorage.removeItem('andrey-fit-pending-client-invite')
      inviteAccepted=true
    }

    // Supabase email confirmation may return auth tokens in the URL fragment.
    // Once the session and invitation are processed, remove technical callback data
    // so the user lands on a clean Andrey Fit URL.
    const recoveryCallback =
      pageQuery.get('reset') === '1' ||
      window.location.hash.includes('type=recovery')
    const authCallbackInHash =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('refresh_token=') ||
      window.location.hash.includes('error_code=') ||
      window.location.hash.includes('type=signup') ||
      recoveryCallback

    if(recoveryCallback){
      sessionStorage.setItem('andrey-fit-password-recovery-at',String(Date.now()))
    }

    if (inviteAccepted || pendingTrainer || authCallbackInHash) {
      const targetHash=recoveryCallback?'#/reset-password':'#/'
      window.history.replaceState({},document.title,getAppBaseUrl()+targetHash)
    }

    const { data: profile,error:profileError } = await withTimeout(
      supabase
        .from('profiles')
        .select('display_name, role, timezone, must_set_password')
        .eq('id', userId)
        .maybeSingle(),
      'Сервер профиля не ответил. Проверь соединение и попробуй ещё раз.',
    )

    if(profileError||!profile){
      setAuthIssue(profileError?.message?('Не удалось загрузить профиль: '+profileError.message):'Профиль пользователя не найден.')
      return
    }

    const role: UserRole = profile.role === 'trainer' ? 'trainer' : 'client'
    setAppTimeZone(profile?.timezone)
    let enabledModules: string[] = []

    if (role === 'client') {
      const today = appDateKey()
      const [coachResult,modulesResult]=await Promise.all([
        withTimeout(
          supabase
            .from('coach_clients')
            .select('status')
            .eq('client_id',userId)
            .order('started_at',{ascending:false})
            .limit(1)
            .maybeSingle(),
          'Не удалось проверить статус сопровождения: сервер не ответил.',
        ),
        withTimeout(
          supabase
            .from('client_modules')
            .select('module_code, enabled, starts_at, ends_at')
            .eq('client_id', userId),
          'Не удалось загрузить разделы клиента: сервер не ответил.',
        ),
      ])
      const {data:coachLink,error:coachLinkError}=coachResult
      const {data:modules,error:modulesError}=modulesResult

      if(coachLinkError){
        setAuthIssue('Не удалось проверить статус сопровождения: '+coachLinkError.message)
        return
      }
      if(coachLink?.status==='paused'){
        setAuthIssue('Сопровождение временно заморожено. Если это неожиданно — свяжись с тренером.')
        return
      }
      if(coachLink?.status==='finished'){
        setAuthIssue('Сопровождение завершено. Данные сохранены в архиве у тренера.')
        return
      }
      if(modulesError){
        setAuthIssue('Не удалось загрузить доступные разделы клиента: '+modulesError.message)
        return
      }

      enabledModules = (modules ?? [])
        .filter(item => item.enabled && item.starts_at <= today && (!item.ends_at || item.ends_at >= today))
        .map(item => item.module_code)
    }

    setAuthIssue('')
    setState({
      authenticated: true,
      preview: false,
      role,
      name: profile?.display_name || 'Пользователь',
      enabledModules,
      accessSetupRequired:role==='client'&&Boolean(profile.must_set_password),
    })
  }

  function preview(role: UserRole) {
    setState({
      authenticated: true,
      preview: true,
      role,
      name: role === 'trainer' ? 'Андрей' : 'Сергей',
      enabledModules: role === 'client' ? previewClientModules : [],
      accessSetupRequired:false,
    })
  }

  async function bindTelegramOwner(email:string,password:string){
    await bindOwnerTelegram(email,password)
    window.location.reload()
  }

  async function logout() {
    if(telegramMode){
      getTelegramWebApp()?.close?.()
      return
    }
    if(!state.preview&&supabase){
      const {error}=await supabase.auth.signOut()
      if(error){
        setAuthIssue('Не удалось выйти из аккаунта. Проверь соединение и попробуй ещё раз.')
        return
      }
    }
    setAuthIssue('')
    setState(initial)
    if(trainerPwa)window.location.hash='#/trainer-access'
  }

  if (supabase && !authReady) return <AuthLoadingScreen title={telegramMode?'Проверяем вход через Telegram…':'Загружаем личный кабинет…'} subtitle="Это обычно занимает несколько секунд."/>
  if(authIssue)return <div className="auth-issue-screen"><div className="auth-issue-card"><strong>Не удалось открыть кабинет</strong><p>{authIssue}</p><div><button className="ghost-button" onClick={()=>window.location.reload()}>Повторить</button><button className="primary-button compact" onClick={()=>void logout()}>{telegramMode?'Закрыть':'Выйти'}</button></div></div></div>
  if(telegramMode&&!state.authenticated){
    if(telegramStatus==='unlinked')return <TelegramConnectPage mode="unlinked" user={telegramUser} onRetry={()=>window.location.reload()} onBindOwner={bindTelegramOwner}/>
    if(telegramStatus==='error')return <TelegramConnectPage mode="error" message={telegramIssue} onRetry={()=>window.location.reload()}/>
  }
  if (!state.authenticated) return (trainerAccessPath||trainerPwa)?<TrainerLoginPage/>:<LoginPage onAuthenticated={()=>{}} />
  if(!telegramMode&&(trainerAccessPath||trainerPwa)&&state.role!=='trainer'){
    return <div className="auth-issue-screen"><div className="auth-issue-card"><strong>Доступ запрещён</strong><p>Этот адрес предназначен только для кабинета тренера.</p><div><button className="primary-button compact" onClick={()=>void logout()}>Выйти</button></div></div></div>
  }
  if(state.role==='client'&&state.accessSetupRequired&&!state.preview){
    return <FirstAccessSetupPage
      initialName={state.name}
      onLogout={logout}
      onCompleted={name=>setState(current=>({...current,name,accessSetupRequired:false}))}
    />
  }

  const clientHas = (moduleCode: string) =>
    state.role === 'client' && state.enabledModules.includes(moduleCode)

  return (
    <Routes>
      <Route
        element={
          <AppShell
            role={state.role}
            name={state.name}
            preview={state.preview}
            enabledModules={state.enabledModules}
            onLogout={logout}
            telegramTestClient={telegramMode&&telegramTestClient}
            telegramMode={telegramMode}
          />
        }
      >
        <Route
          path="/"
          element={state.role === 'trainer'
            ? <TrainerHomePage preview={state.preview}/>
            : <DashboardPage name={state.name} enabledModules={state.enabledModules} preview={state.preview}/>}
        />

        <Route path="/nutrition" element={clientHas('nutrition') ? <NutritionPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/workouts" element={clientHas('training') ? <WorkoutsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/progress" element={clientHas('progress') ? <ProgressPage preview={state.preview} trainingEnabled={state.preview||state.enabledModules.includes('training')}/> : <Navigate to="/" replace/>}/>
        <Route path="/settings" element={state.role==='client'?<SettingsHubPage/>:<SettingsPage preview={state.preview} role={state.role}/>}/>
        <Route path="/settings/profile" element={state.role==='client'?<SettingsPage preview={state.preview} role={state.role} section="profile"/>:<Navigate to="/settings" replace/>}/>
        <Route path="/settings/notifications" element={state.role==='client'?<SettingsPage preview={state.preview} role={state.role} section="notifications"/>:<Navigate to="/settings" replace/>}/>
        <Route path="/settings/personalization" element={state.role==='client'?<SettingsPage preview={state.preview} role={state.role} section="personalization"/>:<Navigate to="/settings" replace/>}/>
        <Route path="/settings/app" element={state.role==='client'?<SettingsPage preview={state.preview} role={state.role} section="app"/>:<Navigate to="/settings" replace/>}/>
        <Route path="/useful" element={state.role==='client'?<UsefulPage/>:<Navigate to="/" replace/>}/>
        <Route path="/useful/body-composition" element={state.role==='client'?<BodyCompositionPage preview={state.preview}/>:<Navigate to="/" replace/>}/>
        <Route path="/notifications" element={state.role==='trainer'||clientHas('notifications')?<NotificationsPage preview={state.preview}/>:<Navigate to="/" replace/>}/>
        <Route path="/materials" element={<MaterialsPage/>}/>
        <Route path="/materials/:slug" element={<MaterialsPage/>}/>
        <Route path="/trainer" element={<TrainerProfilePage preview={state.preview}/>}/>
        <Route path="/reset-password" element={<PasswordResetPage role={state.role}/>}/>

        <Route path="/clients" element={state.role === 'trainer' ? <AdminPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/clients/:clientId" element={state.role === 'trainer' ? <ClientWorkspacePage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder" element={state.role === 'trainer' ? <BuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/inbox" element={state.role === 'trainer' ? <InboxPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/exercises" element={state.role === 'trainer' ? <ExerciseLibraryPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/programs/new" element={state.role === 'trainer' ? <ProgramBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/programs/:programId/edit" element={state.role === 'trainer' ? <ProgramBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/replacements" element={state.role === 'trainer' ? <ReplacementGroupsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/nutrition/new" element={state.role === 'trainer' ? <NutritionBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/nutrition/:planId/edit" element={state.role === 'trainer' ? <NutritionBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Route>
    </Routes>
  )
}
