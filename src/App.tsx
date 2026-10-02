import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
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
import { InboxPage } from './pages/InboxPage'
import { NutritionBuilderPage } from './pages/NutritionBuilderPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { TrainerProfilePage } from './pages/TrainerProfilePage'
import { FirstAccessSetupPage } from './pages/FirstAccessSetupPage'
import { supabase } from './lib/supabase'
import { getAppBaseUrl } from './lib/appUrl'
import { appDateKey, setAppTimeZone } from './lib/appDate'
import type { UserRole } from './lib/types'

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

export default function App() {
  const [state, setState] = useState<AppState>(initial)
  const [authReady,setAuthReady]=useState(false)
  const [authIssue,setAuthIssue]=useState('')

  useEffect(() => {
    const client=supabase
    if (!client) {
      setAuthReady(true)
      return
    }

    let cancelled=false
    let unsubscribe:(()=>void)|undefined

    const bootstrap=async()=>{
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

      const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{
        if(cancelled)return
        if(session){
          void loadProfile(session.user.id).finally(()=>{
            if(!cancelled)setAuthReady(true)
          })
        }else{
          setState(initial)
          setAuthIssue('')
          setAuthReady(true)
        }
      })
      unsubscribe=()=>listener.subscription.unsubscribe()
    }

    void bootstrap()
    return ()=>{
      cancelled=true
      unsubscribe?.()
    }
  }, [])

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

    const { data: profile,error:profileError } = await supabase
      .from('profiles')
      .select('display_name, role, timezone, must_set_password')
      .eq('id', userId)
      .maybeSingle()

    if(profileError||!profile){
      setAuthIssue(profileError?.message?('Не удалось загрузить профиль: '+profileError.message):'Профиль пользователя не найден.')
      return
    }

    const role: UserRole = profile.role === 'trainer' ? 'trainer' : 'client'
    setAppTimeZone(profile?.timezone)
    let enabledModules: string[] = []

    if (role === 'client') {
      const {data:coachLink,error:coachLinkError}=await supabase
        .from('coach_clients')
        .select('status')
        .eq('client_id',userId)
        .order('started_at',{ascending:false})
        .limit(1)
        .maybeSingle()

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

      const today = appDateKey()
      const { data: modules,error:modulesError } = await supabase
        .from('client_modules')
        .select('module_code, enabled, starts_at, ends_at')
        .eq('client_id', userId)

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

  async function logout() {
    if(!state.preview&&supabase){
      const {error}=await supabase.auth.signOut()
      if(error){
        setAuthIssue('Не удалось выйти из аккаунта. Проверь соединение и попробуй ещё раз.')
        return
      }
    }
    setAuthIssue('')
    setState(initial)
  }

  if (supabase && !authReady) return <div className="app-auth-loading">Загружаем личный кабинет…</div>
  if(authIssue)return <div className="auth-issue-screen"><div className="auth-issue-card"><strong>Не удалось открыть кабинет</strong><p>{authIssue}</p><div><button className="ghost-button" onClick={()=>window.location.reload()}>Повторить</button><button className="primary-button compact" onClick={()=>void logout()}>Выйти</button></div></div></div>
  if (!state.authenticated) return <LoginPage onPreview={preview} onAuthenticated={()=>{}} />
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
          />
        }
      >
        <Route
          path="/"
          element={state.role === 'trainer'
            ? <TrainerHomePage/>
            : <DashboardPage name={state.name} enabledModules={state.enabledModules} preview={state.preview}/>}
        />

        <Route path="/nutrition" element={clientHas('nutrition') ? <NutritionPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/workouts" element={clientHas('training') ? <WorkoutsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/progress" element={clientHas('progress') ? <ProgressPage preview={state.preview} trainingEnabled={state.preview||state.enabledModules.includes('training')}/> : <Navigate to="/" replace/>}/>
        <Route path="/settings" element={<SettingsPage preview={state.preview} role={state.role}/>}/>
        <Route path="/notifications" element={state.role==='trainer'||clientHas('notifications')?<NotificationsPage preview={state.preview}/>:<Navigate to="/" replace/>}/>
        <Route path="/materials" element={<MaterialsPage/>}/>
        <Route path="/materials/:slug" element={<MaterialsPage/>}/>
        <Route path="/trainer" element={<TrainerProfilePage preview={state.preview}/>}/>
        <Route path="/reset-password" element={<PasswordResetPage role={state.role}/>}/>

        <Route path="/clients" element={state.role === 'trainer' ? <AdminPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/clients/:clientId" element={state.role === 'trainer' ? <ClientWorkspacePage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder" element={state.role === 'trainer' ? <BuilderPage/> : <Navigate to="/" replace/>}/>
        <Route path="/inbox" element={state.role === 'trainer' ? <InboxPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/exercises" element={state.role === 'trainer' ? <ExerciseLibraryPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/programs/new" element={state.role === 'trainer' ? <ProgramBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/replacements" element={state.role === 'trainer' ? <ReplacementGroupsPage preview={state.preview}/> : <Navigate to="/" replace/>}/>
        <Route path="/builder/nutrition/new" element={state.role === 'trainer' ? <NutritionBuilderPage preview={state.preview}/> : <Navigate to="/" replace/>}/>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Route>
    </Routes>
  )
}
