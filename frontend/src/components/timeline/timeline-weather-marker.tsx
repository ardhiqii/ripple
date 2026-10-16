import { CloudRain, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { TimelineWeather } from '@/features/schedule/types'

import './timeline-weather-marker.css'

interface WeatherDayMarkerProps {
  observations: TimelineWeather[]
  dateLabel?: string
}

interface DetailPosition {
  left: number
  top: number
}

export function WeatherDayMarker({ observations, dateLabel }: WeatherDayMarkerProps) {
  const noGoObservations = observations.filter((observation) => observation.go === false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [detailPosition, setDetailPosition] = useState<DetailPosition | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<DetailPosition | null>(null)
  const tooltipId = useId()
  const detailId = useId()

  const locations = unique(noGoObservations.map((observation) => observation.location))
  const dayLabel = dateLabel ?? `D+${noGoObservations[0]?.day ?? ''}`
  const summary = `Weather no-go · ${dayLabel} · ${locations.length} ${locations.length === 1 ? 'location' : 'locations'}: ${locations.join(', ')}`

  const closeDetail = useCallback(() => {
    setOpen(false)
    setDetailPosition(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDetail()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node) || detailRef.current?.contains(event.target as Node)) return
      closeDetail()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [closeDetail, open])

  useLayoutEffect(() => {
    if (!open) return undefined

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const detail = detailRef.current?.getBoundingClientRect()
      if (!trigger || !detail) return

      const gap = 8
      const horizontalPadding = 8
      const left = Math.min(
        Math.max(horizontalPadding, trigger.right - detail.width),
        Math.max(horizontalPadding, window.innerWidth - detail.width - horizontalPadding),
      )
      const belowTop = trigger.bottom + gap
      const top = belowTop + detail.height <= window.innerHeight - horizontalPadding
        ? belowTop
        : Math.max(horizontalPadding, trigger.top - detail.height - gap)
      setDetailPosition({ left, top })
    }

    updatePosition()
    const handleViewportChange = () => updatePosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, noGoObservations.length])

  useLayoutEffect(() => {
    if (!previewOpen || open) return undefined

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const tooltip = tooltipRef.current?.getBoundingClientRect()
      if (!trigger || !tooltip) return

      const gap = 8
      const edge = 8
      const left = Math.min(Math.max(edge, trigger.left + trigger.width / 2 - tooltip.width / 2), Math.max(edge, window.innerWidth - tooltip.width - edge))
      const below = trigger.bottom + gap
      const top = below + tooltip.height <= window.innerHeight - edge ? below : Math.max(edge, trigger.top - tooltip.height - gap)
      setTooltipPosition({ left, top })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, previewOpen, summary])

  if (!noGoObservations.length) return null

  return (
    <span ref={containerRef} className={`timeline-weather-marker${open ? ' is-open' : ''}`} onPointerDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="timeline-weather-marker__trigger"
        aria-label={summary}
        aria-describedby={previewOpen && !open ? tooltipId : undefined}
        aria-controls={detailId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => setPreviewOpen(true)}
        onPointerLeave={() => setPreviewOpen(false)}
        onFocus={() => setPreviewOpen(true)}
        onBlur={() => setPreviewOpen(false)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (open) closeDetail()
          else {
            setPreviewOpen(false)
            setOpen(true)
          }
        }}
      >
        <CloudRain weight="bold" aria-hidden="true" />
        <span className="timeline-weather-marker__label">No-go</span>
      </button>
      {previewOpen && !open ? createPortal(
        <span
          ref={tooltipRef}
          id={tooltipId}
          className="timeline-weather-marker__tooltip"
          role="tooltip"
          style={tooltipPosition ? { left: tooltipPosition.left, top: tooltipPosition.top } : { visibility: 'hidden' }}
        >
          {summary}
        </span>,
        document.body,
      ) : null}
      {open ? createPortal(
        <div
          ref={detailRef}
          id={detailId}
          className="timeline-weather-marker__detail"
          role="dialog"
          aria-label={`Weather no-go details · ${dayLabel}`}
          style={detailPosition ? { left: detailPosition.left, top: detailPosition.top } : { visibility: 'hidden' }}
        >
          <div className="timeline-weather-marker__detail-heading">
            <div>
              <strong>Weather no-go · {dayLabel}</strong>
              <span>{locations.join(', ')}</span>
            </div>
            <button type="button" className="timeline-weather-marker__close" aria-label="Close weather details" onClick={closeDetail}>
              <X aria-hidden="true" />
            </button>
          </div>
          <ul>
            {noGoObservations.map((observation, index) => (
              <li key={`${observation.location}-${observation.metric}-${observation.source}-${index}`}>
                <strong>{observation.location}</strong>
                <span>{formatObservation(observation)}</span>
                <small>Source: {observation.source}</small>
              </li>
            ))}
          </ul>
          <p>Weather is location/day context only; it does not create explicit resource unavailability or change capacity by itself.</p>
        </div>,
        document.body,
      ) : null}
    </span>
  )
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function formatObservation(observation: TimelineWeather) {
  const metric = observation.metric.replaceAll('_', ' ')
  const value = observation.value === undefined ? 'value unavailable' : String(observation.value)
  return `${metric}: ${value} · No-go`
}
