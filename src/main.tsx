import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'
import './design-system.css'
import './telegram.css'
import { currentPwaVariant, isStandalonePwa, markPwaInstalled, type PwaVariant } from './lib/pwaInstall'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallWindow = Window & {
  __andreyFitInstallPrompt?: InstallPromptEvent
  __andreyFitInstallVariant?: PwaVariant
  __andreyFitPwaVariant?: PwaVariant
}

const pwaVariant=currentPwaVariant()
;(window as InstallWindow).__andreyFitPwaVariant=pwaVariant
if(isStandalonePwa())markPwaInstalled(pwaVariant)

window.addEventListener('beforeinstallprompt',(event)=>{
  event.preventDefault()
  const target=window as InstallWindow
  target.__andreyFitInstallPrompt=event as InstallPromptEvent
  target.__andreyFitInstallVariant=pwaVariant
  window.dispatchEvent(new CustomEvent('andrey-fit-install-available',{detail:{variant:pwaVariant}}))
})
window.addEventListener('appinstalled',()=>{
  const target=window as InstallWindow
  const variant=target.__andreyFitInstallVariant??pwaVariant
  markPwaInstalled(variant)
  delete target.__andreyFitInstallPrompt
  delete target.__andreyFitInstallVariant
  window.dispatchEvent(new CustomEvent('andrey-fit-app-installed',{detail:{variant}}))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </AppErrorBoundary>
  </StrictMode>,
)

requestAnimationFrame(()=>{
  document.documentElement.classList.add('app-ready')
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw-v6.js', { scope: '/', updateViaCache: 'none' })
    .then(registration=>registration.update())
    .catch(() => undefined)
}
