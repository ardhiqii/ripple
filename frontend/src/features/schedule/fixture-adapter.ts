import type { TimelineDay, TimelineResource, TimelineRange, TimelineTone } from './types'

export const timelineDays: TimelineDay[] = [
  { day: '18', weekday: 'Fri', month: 'September' },
  { day: '19', weekday: 'Sat', month: 'September' },
  { day: '20', weekday: 'Sun', month: 'September' },
  { day: '21', weekday: 'Mon', month: 'September' },
  { day: '22', weekday: 'Tue', month: 'September' },
  { day: '23', weekday: 'Wed', month: 'September' },
  { day: '24', weekday: 'Thu', month: 'September' },
  { day: '25', weekday: 'Fri', month: 'September' },
  { day: '26', weekday: 'Sat', month: 'September' },
  { day: '27', weekday: 'Sun', month: 'September' },
  { day: '28', weekday: 'Mon', month: 'September' },
  { day: '29', weekday: 'Tue', month: 'September', today: true },
  { day: '30', weekday: 'Wed', month: 'September' },
  { day: '1', weekday: 'Thu', month: 'October', monthStart: true },
  { day: '2', weekday: 'Fri', month: 'October' },
  { day: '3', weekday: 'Sat', month: 'October' },
  { day: '4', weekday: 'Sun', month: 'October' },
  { day: '5', weekday: 'Mon', month: 'October' },
  { day: '6', weekday: 'Tue', month: 'October' },
  { day: '7', weekday: 'Wed', month: 'October' },
  { day: '8', weekday: 'Thu', month: 'October' },
  { day: '9', weekday: 'Fri', month: 'October' },
  { day: '10', weekday: 'Sat', month: 'October' },
  { day: '11', weekday: 'Sun', month: 'October' },
]

export const timelineResources: TimelineResource[] = [
  { id: 'cakra', name: 'CAKRA ONE', code: 'CKR-01', group: 'Barges', kind: 'barge', utilization: 78, location: 'North Delta', jobs: [{ id: 'WID-32', label: 'Pump repair', start: 0, span: 4, tone: 'red', status: 'complete' }, { id: 'TRN-08', label: 'Transit to field', start: 4, span: 4, tone: 'gray', status: 'complete' }, { id: 'HOK-14', label: 'Hook-up', start: 8, span: 6, tone: 'green', status: 'progress', progress: 46 }, { id: 'SRV-11', label: 'Survey ops', start: 14, span: 4, tone: 'blue' }, { id: 'WID-38', label: 'Pump repair', start: 18, span: 5, tone: 'red' }] },
  { id: 'mahakam', name: 'MAHAKAM LIFT', code: 'MHK-03', group: 'Barges', kind: 'barge', utilization: 62, location: 'West Alpha', jobs: [{ id: 'CIN-13', label: 'Repair + stimulation', start: 0, span: 6, tone: 'blue', status: 'complete' }, { id: 'SUN-10', label: 'Pump repair', start: 6, span: 4, tone: 'red', risk: true }, { id: 'DRY DOCK', label: 'Main yard', start: 10, span: 11, tone: 'gray', status: 'progress', progress: 31 }, { id: 'CIN-04', label: 'Pump repair', start: 21, span: 3, tone: 'blue' }] },
  { id: 'samudra', name: 'SAMUDRA 225', code: 'SMD-25', group: 'Barges', kind: 'barge', utilization: 84, location: 'North Delta', jobs: [{ id: 'YVOB-14', label: 'Pump repair', start: 0, span: 5, tone: 'blue' }, { id: 'RAMG-01', label: 'ESP changeout', start: 5, span: 5, tone: 'red', delta: -2, risk: true }, { id: 'CINA-06', label: 'Pump repair', start: 10, span: 4, tone: 'green' }, { id: 'CINC-01', label: 'Pump repair', start: 14, span: 4, tone: 'gray' }, { id: 'CING-13', label: 'Pump repair', start: 18, span: 4, tone: 'green' }] },
  { id: 'meranti', name: 'MERANTI', code: 'MRT-07', group: 'Barges', kind: 'barge', utilization: 12, location: 'Port standby', jobs: [] },
  { id: 'pelikan', name: 'PELIKAN SUPPLY', code: 'SUP-11', group: 'Supply boats', kind: 'supply', utilization: 68, location: 'Base A', jobs: [{ id: 'SUP-01', label: 'Platform support', start: 1, span: 6, tone: 'green', status: 'complete' }, { id: 'SUP-02', label: 'Drilling support', start: 8, span: 7, tone: 'blue', status: 'progress', progress: 64 }, { id: 'WX HOLD', label: 'Weather hold', start: 15, span: 3, tone: 'gray', status: 'hold' }, { id: 'SUP-03', label: 'IMR support', start: 18, span: 5, tone: 'green' }] },
  { id: 'nusa', name: 'NUSA PRIDE', code: 'SUP-18', group: 'Supply boats', kind: 'supply', utilization: 45, location: 'Base B', jobs: [{ id: 'STANDBY', label: 'Port readiness', start: 0, span: 7, tone: 'gray' }, { id: 'SUP-06', label: 'Well intervention', start: 9, span: 10, tone: 'blue' }, { id: 'EMR-02', label: 'Emergency slot', start: 19, span: 5, tone: 'red' }] },
  { id: 'bay-a', name: 'TEST BAY ALPHA', code: 'TB-A', group: 'Test bays', kind: 'test', utilization: 91, location: 'Vendor yard', jobs: [{ id: 'FT-032', label: 'Integrity test', start: 0, span: 5, tone: 'red' }, { id: 'FT-014', label: 'Flow test', start: 5, span: 6, tone: 'green' }, { id: 'PT-221', label: 'Pressure test', start: 11, span: 6, tone: 'blue' }, { id: 'FT-015', label: 'Flow test', start: 17, span: 7, tone: 'green' }] },
  { id: 'crew-a', name: 'ALPHA LIFT CREW', code: 'CR-A', group: 'Lift crews', kind: 'crew', utilization: 76, location: 'Offshore', jobs: [{ id: 'MOB-A', label: 'Mobilization', start: 0, span: 4, tone: 'blue' }, { id: 'INST-01', label: 'Installation support', start: 4, span: 8, tone: 'green' }, { id: 'STBY', label: 'Standby', start: 12, span: 5, tone: 'gray' }, { id: 'MNT-09', label: 'Maintenance support', start: 17, span: 7, tone: 'blue' }] },
]

export const resourceGroupOptions = ['All resources', 'Barges', 'Supply boats', 'Test bays', 'Lift crews'] as const

const vendorByTone: Record<TimelineTone, string> = {
  green: 'Baker',
  red: 'Powerlift',
  blue: 'Schlumberger',
  gray: 'No vendor',
}

export function vendorForTone(tone: TimelineTone) {
  return vendorByTone[tone]
}

export interface ScheduleFilter {
  groups?: string[]
  vendors?: string[]
  status?: string
  query?: string
}

export function getVisibleResources(resources: TimelineResource[], filter: ScheduleFilter) {
  const query = filter.query?.trim().toLowerCase()
  return resources.filter((resource) => {
    const groupMatch = !filter.groups?.length || filter.groups.includes(resource.group)
    const jobs = resource.jobs
    const vendorMatch = !filter.vendors?.length || jobs.some((job) => filter.vendors?.includes(vendorForTone(job.tone)))
    const statusMatch = !filter.status || jobs.some((job) => (job.status ?? 'planned') === filter.status)
    const text = `${resource.name} ${resource.code} ${resource.location} ${jobs.map((job) => `${job.id} ${job.label}`).join(' ')}`.toLowerCase()
    return groupMatch && vendorMatch && statusMatch && (!query || text.includes(query))
  })
}

export function getVisibleJobs(resource: TimelineResource, filter: Pick<ScheduleFilter, 'vendors' | 'status'>) {
  return resource.jobs.filter((job) => {
    const vendorMatch = !filter.vendors?.length || filter.vendors.includes(vendorForTone(job.tone))
    const statusMatch = !filter.status || (job.status ?? 'planned') === filter.status
    return vendorMatch && statusMatch
  })
}

export function findJob(resources: TimelineResource[], jobId: string | undefined) {
  if (!jobId) return undefined
  for (const resource of resources) {
    const job = resource.jobs.find((candidate) => candidate.id === jobId)
    if (job) return { job, resource }
  }
  return undefined
}

export function getDaysInRange(range: TimelineRange) {
  const from = Math.max(0, Math.min(range.from, timelineDays.length - 1))
  const to = Math.max(from, Math.min(range.to, timelineDays.length - 1))
  return timelineDays.slice(from, to + 1)
}
