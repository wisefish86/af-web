import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'\nimport './telegram.css'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallWindow = Window & { __andreyFitInstallPrompt?: InstallPromptEvent }

window.addEventListener('beforeinstallprompt',(event)=>{
  event.preventDefault()
  ;(window as InstallWindow).__andreyFitInstallPrompt=event as InstallPromptEvent
  window.dispatchEvent(new Event('andrey-fit-install-available'))
})
window.addEventListener('appinstalled',()=>{
  delete (window as InstallWindow).__andreyFitInstallPrompt
  window.dispatchEvent(new Event('andrey-fit-app-installed'))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw-v6.js', { scope: '/', updateViaCache: 'none' })
    .then(registration=>registration.update())
    .catch(() => undefined)
}
