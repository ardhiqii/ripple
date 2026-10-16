import { describe, expect, it } from 'vitest'

import { getVisibleResources, timelineResources } from './fixture-adapter'

describe('timeline search and filters', () => {
  it('combines query, group, vendor, and status without changing resource identity', () => {
    const visible = getVisibleResources(timelineResources, {
      query: 'RAMG',
      groups: ['Barges'],
      vendors: ['Powerlift'],
      status: 'planned',
    })

    expect(visible.map((resource) => resource.name)).toEqual(['SAMUDRA 225'])
  })

  it('does not keep a resource for a hidden job match', () => {
    expect(getVisibleResources(timelineResources, {
      query: 'CINA-06',
      groups: ['Barges'],
      vendors: ['Powerlift'],
      status: 'planned',
    })).toEqual([])
  })

  it('keeps a resource match even when every block is hidden by filters', () => {
    expect(getVisibleResources(timelineResources, {
      query: 'SAMUDRA',
      vendors: ['Powerlift'],
      status: 'complete',
    }).map((resource) => resource.name)).toEqual(['SAMUDRA 225'])
  })
})
