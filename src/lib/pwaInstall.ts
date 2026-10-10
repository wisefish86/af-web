export type PwaVariant='client'|'trainer'

type RelatedApp={platform?:string;id?:string;url?:string}
type PwaNavigator=Navigator&{
  standalone?:boolean
  getInstalledRelatedApps?:()=>Promise<RelatedApp[]>
}
type PwaWindow=Window&{__andreyFitPwaVariant?:PwaVariant}

const markerKey=(variant:PwaVariant)=>`andrey-fit:pwa-installed:${variant}`
const manifestPath=(variant:PwaVariant)=>variant==='trainer'?'/manifest-trainer.json':'/manifest.json'
const expectedId=(variant:PwaVariant)=>variant==='trainer'?'/trainer-app':'/'

export function currentPwaVariant():PwaVariant{
  if(typeof window==='undefined')return 'client'
  const fromWindow=(window as PwaWindow).__andreyFitPwaVariant
  if(fromWindow)return fromWindow
  return new URLSearchParams(window.location.search).get('app')==='trainer'?'trainer':'client'
}

export function isStandalonePwa(){
  if(typeof window==='undefined')return false
  const nav=navigator as PwaNavigator
  return window.matchMedia('(display-mode: standalone)').matches||nav.standalone===true
}

export function markPwaInstalled(variant:PwaVariant){
  try{localStorage.setItem(markerKey(variant),'1')}catch{}
}

export function wasPwaInstalled(variant:PwaVariant){
  try{return localStorage.getItem(markerKey(variant))==='1'}catch{return false}
}

export async function detectInstalledPwa(variant:PwaVariant):Promise<boolean>{
  if(isStandalonePwa()){
    markPwaInstalled(variant)
    return true
  }
  if(wasPwaInstalled(variant))return true

  const nav=navigator as PwaNavigator
  if(typeof nav.getInstalledRelatedApps!=='function')return false
  try{
    const apps=await nav.getInstalledRelatedApps()
    const id=expectedId(variant)
    const manifest=manifestPath(variant)
    const found=apps.some(app=>{
      const appId=app.id??''
      const appUrl=app.url??''
      return app.platform==='webapp'&&(
        appId===id||
        appId===location.origin+id||
        appId.endsWith(id)||
        appUrl===manifest||
        appUrl===location.origin+manifest||
        appUrl.endsWith(manifest)
      )
    })
    if(found)markPwaInstalled(variant)
    return found
  }catch{return false}
}

export function pwaVariantUrl(variant:PwaVariant,hash='/settings'){
  const query=variant==='trainer'?'?app=trainer':''
  return '/'+query+'#'+hash
}

export function pwaVariantName(variant:PwaVariant){
  return variant==='trainer'?'Andrey-Fit Trainer':'Andrey-Fit'
}
