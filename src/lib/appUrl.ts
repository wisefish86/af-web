export function getAppBaseUrl(){
  const pathname=window.location.pathname
  const directory=pathname.endsWith('/')
    ? pathname
    : pathname.replace(/\/[^/]*$/,'/')
  return window.location.origin+directory
}
