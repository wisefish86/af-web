import {describe,expect,it} from 'vitest'
import {rankExerciseReplacements,replacementReason} from '../src/features/exercises/replacements'
import type {Exercise} from '../src/features/exercises/types'

function exercise(overrides:Partial<Exercise>&Pick<Exercise,'id'|'name'>):Exercise{
  return {
    id:overrides.id,name:overrides.name,code:overrides.id,description:null,instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'isolation',tracking_type:'weight_reps',aliases:[],equipment_code:'cable',
    movement_pattern_code:'elbow_extension',default_rest_seconds:75,technique_url:null,image_url:null,animation_url:null,video_url:null,
    is_unilateral:false,is_active:true,primary_muscles:['triceps'],secondary_muscles:[],stabilizer_muscles:[],tags:[],substitution_groups:[],
    ...overrides,
  }
}

const overhead={id:'g-overhead',code:'TRICEPS_OVERHEAD',name:'Разгибания трицепса над головой',purpose:null,scope:'specific' as const,parent_group_id:null}
const broad={id:'g-triceps',code:'TRICEPS_EXTENSION',name:'Упражнения на трицепс',purpose:null,scope:'broad' as const,parent_group_id:null}

describe('exercise replacement ranking',()=>{
  it('puts the same specific replacement group ahead of broad same-muscle alternatives',()=>{
    const source=exercise({id:'source',name:'Канат из-за головы',substitution_groups:[{...overhead,priority:10,is_default:true,match_type:'direct',membership_notes:null},{...broad,priority:40,is_default:false,match_type:'direct',membership_notes:null}]})
    const straightOverhead=exercise({id:'straight-overhead',name:'Прямая рукоять из-за головы',substitution_groups:[{...overhead,priority:15,is_default:false,match_type:'direct',membership_notes:null},{...broad,priority:45,is_default:false,match_type:'direct',membership_notes:null}]})
    const pushdown=exercise({id:'pushdown',name:'Разгибание вниз',substitution_groups:[{...broad,priority:10,is_default:true,match_type:'direct',membership_notes:null}]})

    expect(rankExerciseReplacements(source,[source,pushdown,straightOverhead],'recommended').map(item=>item.id)).toEqual(['straight-overhead'])
    expect(rankExerciseReplacements(source,[source,pushdown,straightOverhead],'all').map(item=>item.id)[0]).toBe('straight-overhead')
    expect(replacementReason(source,straightOverhead)).toBe('Разгибания трицепса над головой')
  })

  it('falls back to same movement and primary muscle when no specific group exists',()=>{
    const source=exercise({id:'source',name:'A',substitution_groups:[]})
    const close=exercise({id:'close',name:'B',substitution_groups:[]})
    const unrelated=exercise({id:'unrelated',name:'C',primary_muscles:['biceps'],movement_pattern_code:'elbow_flexion'})
    expect(rankExerciseReplacements(source,[source,close,unrelated],'recommended').map(item=>item.id)).toEqual(['close'])
  })
})
