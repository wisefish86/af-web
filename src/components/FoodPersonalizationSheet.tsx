import { useEffect, useState } from 'react'
import { Save, Star, X } from 'lucide-react'
import {
  clearMyFoodOverride, loadMyFoodCatalog, sameNutritionFoodDetails, saveMyFoodOverride,
  setMyFoodPreference, setMyPersonalFoodFavorite,
} from '../features/nutrition/service'
import type { NutritionFood } from '../features/nutrition/types'
import { showAppToast } from '../lib/toast'

type Props={
  food:NutritionFood
  preview?:boolean
  onClose:()=>void
  onChanged:(food:NutritionFood)=>void
}

export function FoodPersonalizationSheet({food,preview=false,onClose,onChanged}:Props){
  const [draft,setDraft]=useState<NutritionFood>(food)
  const [saving,setSaving]=useState(false)
  const [favoriteBusy,setFavoriteBusy]=useState(false)

  useEffect(()=>setDraft(food),[food.id,food.source])

  const detailsDirty=
    draft.name.trim()!==food.name.trim()
    || draft.kcal_100!==food.kcal_100
    || draft.protein_100!==food.protein_100
    || draft.fat_100!==food.fat_100
    || draft.carbs_100!==food.carbs_100
    || draft.default_portion_g!==food.default_portion_g

  async function save(){
    if(saving||!detailsDirty)return
    if(!draft.name.trim()){showAppToast('Укажи название продукта.','warning');return}
    if([draft.kcal_100,draft.protein_100,draft.fat_100,draft.carbs_100].some(v=>!Number.isFinite(v)||v<0)
      ||(draft.default_portion_g!=null&&(!Number.isFinite(draft.default_portion_g)||draft.default_portion_g<=0))){
      showAppToast('Проверь КБЖУ и обычную порцию.','warning');return
    }
    setSaving(true)
    try{
      if(!preview)await saveMyFoodOverride({...draft,name:draft.name.trim()})
      const next={...draft,name:draft.name.trim(),overridden:draft.source==='global'?true:draft.overridden}
      onChanged(next)
      showAppToast(draft.source==='global'
        ?'Личные значения продукта сохранены. Общий справочник не изменился.'
        :'Личный продукт обновлён.')
      onClose()
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyFoodCatalog()
          const savedFood=actual.find(item=>item.id===draft.id&&item.source===draft.source)
          const expected={...draft,name:draft.name.trim()}
          if(savedFood&&sameNutritionFoodDetails(savedFood,expected)){
            onChanged(savedFood)
            showAppToast('Изменения уже были сохранены на сервере.','info')
            onClose()
            return
          }
        }catch{}
      }
      showAppToast(e instanceof Error?e.message:'Не удалось сохранить продукт','error')
    }
    finally{setSaving(false)}
  }

  async function toggleFavorite(){
    if(favoriteBusy)return
    const next=!draft.favorite
    setDraft(v=>({...v,favorite:next}))
    if(preview){
      onChanged({...food,favorite:next})
      return
    }
    setFavoriteBusy(true)
    try{
      if(draft.source==='personal')await setMyPersonalFoodFavorite(draft.id,next)
      else await setMyFoodPreference(draft.id,next?'preferred':'allowed')
      onChanged({...food,favorite:next})
    }catch(e){
      try{
        const actual=await loadMyFoodCatalog()
        const savedFood=actual.find(item=>item.id===draft.id&&item.source===draft.source)
        if(savedFood?.favorite===next){
          setDraft(savedFood)
          onChanged(savedFood)
          return
        }
      }catch{}
      setDraft(v=>({...v,favorite:!next}))
      showAppToast(e instanceof Error?e.message:'Не удалось изменить избранное','error')
    }finally{setFavoriteBusy(false)}
  }

  async function reset(){
    if(draft.source==='personal'||saving)return
    setSaving(true)
    try{
      if(!preview){
        await clearMyFoodOverride(draft.id)
        try{
          const fresh=(await loadMyFoodCatalog()).find(f=>f.source==='global'&&f.id===draft.id)
          if(fresh)onChanged(fresh)
          else showAppToast('Личные изменения сброшены, но обновлённую карточку не удалось получить.','warning')
        }catch{
          showAppToast('Личные изменения сброшены на сервере. Каталог обновится при следующем открытии.','warning')
        }
      }else{
        onChanged({...food,name:food.base_name??food.name,overridden:false})
      }
      onClose()
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyFoodCatalog()
          const fresh=actual.find(f=>f.source==='global'&&f.id===draft.id)
          if(fresh&&!fresh.overridden){
            onChanged(fresh)
            showAppToast('Личные изменения уже были сброшены на сервере.','info')
            onClose()
            return
          }
        }catch{}
      }
      showAppToast(e instanceof Error?e.message:'Не удалось вернуть значения справочника','error')
    }
    finally{setSaving(false)}
  }

  const numberField=(label:string,key:'kcal_100'|'protein_100'|'fat_100'|'carbs_100')=>
    <label><span>{label}</span><input type="number" min="0" step="0.1" value={draft[key]} onChange={e=>setDraft(v=>({...v,[key]:Number(e.target.value)}))}/></label>

  return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose()}}>
    <aside className="exercise-drawer workout-sheet food-personalization-sheet">
      <div className="drawer-head">
        <div><span className="eyebrow">Продукт</span><h3>{draft.name}</h3></div>
        <button className="icon-button" disabled={saving} onClick={onClose}><X size={18}/></button>
      </div>
      <div className="drawer-body">
        <div className="food-personalization-note">
          <strong>{draft.source==='personal'?'Твой личный продукт':'Персональные значения'}</strong>
          <p>{draft.source==='personal'
            ?'Этот продукт виден только тебе.'
            :'Изменения названия, КБЖУ и порции сохранятся только для тебя. Общий справочник и данные других пользователей не изменятся.'}</p>
        </div>

        <div className="food-personalization-top">
          <label className="wide"><span>Название</span><input value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/></label>
          {draft.source==='global'&&draft.base_name&&draft.name!==draft.base_name&&<small>В справочнике: {draft.base_name}</small>}
          <button className={'favorite-food-button '+(draft.favorite?'is-active':'')} disabled={favoriteBusy} onClick={()=>void toggleFavorite()}><Star size={16} fill={draft.favorite?'currentColor':'none'}/>{draft.favorite?'В избранном':'Добавить в избранное'}</button>
        </div>

        <div className="food-personalization-grid">
          {numberField('ккал / 100 г','kcal_100')}
          {numberField('Белок, г','protein_100')}
          {numberField('Жиры, г','fat_100')}
          {numberField('Углеводы, г','carbs_100')}
          <label><span>Обычная порция, г</span><input type="number" min="1" step="1" value={draft.default_portion_g??''} onChange={e=>setDraft(v=>({...v,default_portion_g:e.target.value===''?null:Number(e.target.value)}))}/></label>
        </div>

        <div className="food-personalization-actions">
          {draft.source==='global'&&draft.overridden&&<button className="ghost-button" disabled={saving} onClick={()=>void reset()}>Вернуть справочник</button>}
          <button className="primary-button compact" disabled={saving||!detailsDirty} onClick={()=>void save()}><Save size={15}/>{saving?'Сохраняю…':detailsDirty?'Сохранить изменения':'Характеристики без изменений'}</button>
        </div>
      </div>
    </aside>
  </div>
}
