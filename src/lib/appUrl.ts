export function getAppBaseUrl(){
  // The app is a hash-routed SPA. Auth callbacks must always return to the
  // application root, never to the currently opened client-side route.
  const marker='/files/andrey-fitness/dev/'
  const pathname=window.location.pathname
  const markerIndex=pathname.indexOf(marker)
  const rootPath=markerIndex>=0
    ? pathname.slice(0,markerIndex+marker.length)
    : pathname.endsWith('/')
      ? pathname
      : pathname.replace(/\/[^/]*$/,'/')
  return window.location.origin+rootPath
}
