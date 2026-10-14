import { useEffect, useMemo, useState } from 'react'

import { JobInspector, TimelineLegend, TimelineMetricStrip, TimelineToolbar, TimelineWorkspace } from '@/components/timeline'
import type { JobInspectorContext } from '@/components/timeline/JobInspector'
import { getDaysInRange, findJob, getVisibleResources, timelineResources } from '@/features/schedule/fixture-adapter'
import type { TimelineRange } from '@/features/schedule/types'
import type { TimelineSearch } from '@/routes/search-schemas'

export interface TimelineAppProps {
  search: TimelineSearch
  onSearchChange: (patch: Partial<TimelineSearch>) => void
  onOpenReadiness?: (context: JobInspectorContext) => void
  onViewDecision?: (context: JobInspectorContext) => void
}

export default function App({ search, onSearchChange, onOpenReadiness, onViewDecision }: TimelineAppProps) {
  const range: TimelineRange = { from: search.from, to: search.to }
  const [notice, setNotice] = useState<string>()
  const selected = findJob(timelineResources, search.job)
  const selectedJobId = selected?.job.id ?? (search.job ? undefined : 'RAMG-01')
  const visibleResources = useMemo(() => getVisibleResources(timelineResources, {
    groups: search.groups,
    vendors: search.vendors,
    status: search.status,
    query: search.q,
  }), [search.groups, search.q, search.status, search.vendors])
  const days = useMemo(() => getDaysInRange({ from: search.from, to: search.to }), [search.from, search.to])

  useEffect(() => {
    if (!search.job || selected) {
      if (selected) setNotice(undefined)
      return
    }
    setNotice(`Job ${search.job} is no longer available in this schedule.`)
    onSearchChange({ job: undefined })
  }, [onSearchChange, search.job, selected])

  const updateRange = (next: TimelineRange) => onSearchChange(next)
  const updateScope = (scope: string) => onSearchChange({ groups: scope === 'All resources' ? [] : [scope] })

  return (
    <main className="app variant-4 unified">
      <TimelineToolbar
        query={search.q ?? ''}
        scope={search.groups[0] ?? 'All resources'}
        range={range}
        onQueryChange={(query) => onSearchChange({ q: query || undefined })}
        onScopeChange={updateScope}
        onRangeChange={updateRange}
      />
      <TimelineMetricStrip />
      {notice && <div className="timeline-notice" role="status" aria-live="polite">{notice}</div>}
      <div className="work-area">
        <TimelineWorkspace
          resources={visibleResources}
          days={days}
          range={range}
          vendors={search.vendors}
          status={search.status}
          selectedJobId={selectedJobId}
          onSelect={(jobId) => onSearchChange({ job: jobId })}
        />
      </div>
      {selected ? <JobInspector job={selected.job} resource={selected.resource} range={range} scheduleVersion={0} onClose={() => onSearchChange({ job: undefined })} onOpenReadiness={onOpenReadiness} onViewDecision={onViewDecision} /> : null}
      <TimelineLegend />
    </main>
  )
}
