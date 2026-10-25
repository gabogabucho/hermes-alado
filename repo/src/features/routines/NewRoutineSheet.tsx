import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Skeleton } from '../../ui/Skeleton'
import { Sheet } from '../../ui/Sheet'
import {
  blueprints,
  blueprintsError,
  blueprintsLoading,
  instantiateBlueprint,
  loadBlueprints,
} from './store'
import type { Blueprint, BlueprintField } from './types'

const PRESET_LABELS: Record<string, string> = {
  everyday: 'Todos los días',
  weekdays: 'Entre semana',
  weekends: 'Fin de semana',
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
}

function presetLabel(value: string): string {
  return PRESET_LABELS[value.toLowerCase()] ?? value
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: BlueprintField
  value: string
  onChange: (next: string) => void
}) {
  if (field.type === 'time') {
    return (
      <input
        className="input"
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    )
  }
  if (field.type === 'enum') {
    return (
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {!field.options.includes(value) && value !== '' && <option value={value}>{value}</option>}
        {field.optional && <option value="">—</option>}
        {field.options.map(option => (
          <option key={option} value={option}>
            {presetLabel(option)}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'weekdays') {
    const options = field.options.length > 0 ? field.options : ['everyday', 'weekdays', 'weekends']
    return (
      <div className="blueprint-chips">
        {options.map(option => (
          <button
            key={option}
            type="button"
            className={`chip${value === option ? ' chip--selected' : ''}`}
            onClick={() => onChange(option)}
          >
            {presetLabel(option)}
          </button>
        ))}
      </div>
    )
  }
  return (
    <input
      className="input"
      type="text"
      placeholder={field.default ?? undefined}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

export function NewRoutineSheet({
  open,
  profile,
  onClose,
  onCreated,
}: {
  open: boolean
  profile: string
  onClose: () => void
  onCreated: () => void
}) {
  const catalog = useStore(blueprints)
  const loading = useStore(blueprintsLoading)
  const error = useStore(blueprintsError)
  const [selected, setSelected] = useState<Blueprint | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    void loadBlueprints(profile)
  }, [profile])

  function pick(blueprint: Blueprint) {
    setSelected(blueprint)
    setSubmitError('')
    const initial: Record<string, string> = {}
    for (const field of blueprint.fields) {
      initial[field.name] = field.default ?? ''
    }
    setValues(initial)
  }

  async function submit() {
    if (!selected || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await instantiateBlueprint(profile, selected.key, values)
      onCreated()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'No se pudo crear la rutina')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={selected ? selected.title : 'Nueva rutina'}>
      <div className="blueprint-sheet">
        {!selected && loading && (
          <div className="list">
            {[0, 1, 2].map(i => (
              <span key={i} className="card">
                <Skeleton height={64} />
              </span>
            ))}
          </div>
        )}

        {!selected && !loading && error && <p className="error-text">{error}</p>}

        {!selected && !loading && !error && catalog.length === 0 && (
          <p className="muted">No hay plantillas disponibles.</p>
        )}

        {!selected && !loading && !error && (
          <div className="list">
            {catalog.map(blueprint => (
              <button
                key={blueprint.key}
                type="button"
                className="blueprint-card"
                onClick={() => pick(blueprint)}
              >
                <span className="blueprint-card-title">{blueprint.title}</span>
                <span className="blueprint-card-desc">{blueprint.description}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="blueprint-form">
            <button type="button" className="btn ghost" onClick={() => setSelected(null)}>
              ‹ Plantillas
            </button>
            <p className="muted">{selected.description}</p>
            {selected.fields.map(field => (
              <label key={field.name} className="blueprint-field">
                <span className="blueprint-field-label">
                  {field.label}
                  {field.help && <span className="faint"> · {field.help}</span>}
                </span>
                <FieldInput
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={next => setValues(v => ({ ...v, [field.name]: next }))}
                />
              </label>
            ))}
            {submitError && <p className="error-text">{submitError}</p>}
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Creando…' : 'Crear rutina'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
