export function getAppBaseUrl(){
  // The app is a hash-routed SPA. Auth emails must always return to the app
  // root, not to whichever nested/browser URL happened to open registration.
  const marker='/files/andrey-fitness/dev/'
  const path=window.location.pathname
  const i=path.indexOf(marker)
  const appPath=i>=0?path.slice(0,i+marker.length):(path.endsWith('/')?path:path.replace(/\/[^/]*$/,'/'))
  return window.location.origin+appPath
}
