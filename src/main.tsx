import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

type InstallWindow = Window & { __andreyFitInstallPrompt?: Event }

window.addEventListener('beforeinstallprompt',(event)=>{
  event.preventDefault()
  ;(window as InstallWindow).__andreyFitInstallPrompt=event
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined)
  })
}
