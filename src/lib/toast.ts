export type AppToastKind='success'|'info'|'warning'|'error'

export function showAppToast(message:string,kind:AppToastKind='success'){
  if(typeof window==='undefined')return
  window.dispatchEvent(new CustomEvent('app:toast',{detail:{message,kind}}))
}
