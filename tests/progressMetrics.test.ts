import {describe,expect,it} from 'vitest'
import {makeDatedChart,summarizeWeeklyWeights} from '../src/features/tracking/progressMetrics'

describe('summarizeWeeklyWeights',()=>{
  it('anchors the current and previous 7-day windows to today, not to the latest measurement',()=>{
    const summary=summarizeWeeklyWeights([
      {measured_at:'2026-09-20',weight_kg:90},
      {measured_at:'2026-09-19',weight_kg:91},
      {measured_at:'2026-09-13',weight_kg:92},
    ],'2026-10-08')
    expect(summary).toEqual({currentAverage:null,previousAverage:null,currentCount:0,previousCount:0})
  })

  it('uses only measurements from the actual current and previous windows',()=>{
    const summary=summarizeWeeklyWeights([
      {measured_at:'2026-10-08',weight_kg:88},
      {measured_at:'2026-10-05',weight_kg:90},
      {measured_at:'2026-10-01',weight_kg:91},
      {measured_at:'2026-09-28',weight_kg:93},
      {measured_at:'2026-09-20',weight_kg:95},
    ],'2026-10-08')
    expect(summary.currentCount).toBe(2)
    expect(summary.previousCount).toBe(2)
    expect(summary.currentAverage).toBe(89)
    expect(summary.previousAverage).toBe(92)
  })
})

describe('makeDatedChart',()=>{
  it('spaces sparse measurements according to elapsed time',()=>{
    const points=makeDatedChart([
      {date:'2026-09-01',value:90},
      {date:'2026-09-02',value:89.8},
      {date:'2026-10-01',value:88},
    ]).split(' ').map(point=>Number(point.split(',')[0]))
    expect(points[0]).toBeCloseTo(0)
    expect(points[1]).toBeCloseTo(100/30)
    expect(points[2]).toBeCloseTo(100)
  })

  it('returns no chart for fewer than two points',()=>{
    expect(makeDatedChart([])).toBe('')
    expect(makeDatedChart([{date:'2026-10-08',value:88}])).toBe('')
  })
})
