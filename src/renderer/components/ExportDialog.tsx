import { useState, useCallback, useEffect, useRef } from 'react'
import type { ViewportHandle } from './Viewport'
import type { CharacterDNA } from '../../shared/types/dna'
import { useCharacterStore } from '../stores/useCharacterStore'
import { exportCharacter, validateExport } from '../services/ExportManager'
import type { ExportValidation } from '../services/ExportManager'
import { getExportProfiles } from '../stores/useExportProfileStore'

interface ExportDialogProps {
  viewportRef: React.RefObject<ViewportHandle | null>
  onClose: () => void
  onEditProfiles?: () => void
}

type DialogState = 'form' | 'exporting' | 'success' | 'error'

export default function ExportDialog({ viewportRef, onClose, onEditProfiles }: ExportDialogProps) {
  const dna = useCharacterStore((s) => s.present) as CharacterDNA | null
  const characterName = useCharacterStore((s) => s.currentCharacterName)
  const [selectedProfile, setSelectedProfile] = useState(getExportProfiles()[0].id)
  const [state, setState] = useState<DialogState>('form')
  const [validation, setValidation] = useState<ExportValidation | null>(null)
  const [filePath, setFilePath] = useState('')
  const [error, setError] = useState('')
  const [validated, setValidated] = useState(false)
  const mountedRef = useRef(true)
  const cancelRef = useRef(false)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!validated && dna) {
      const sceneGroup = viewportRef.current?.getSceneGroup()
      if (sceneGroup) {
        setValidation(validateExport(dna, sceneGroup, viewportRef.current?.hasBaseBody()))
        setValidated(true)
      }
    }
  }, [validated, dna, viewportRef])

  const profiles = getExportProfiles()
  const profile = profiles.find((p) => p.id === selectedProfile) ?? profiles[0]

  const handleCancelExport = useCallback(() => {
    cancelRef.current = true
    onClose()
  }, [onClose])

  const handleExport = useCallback(async () => {
    if (!dna || !characterName) return
    cancelRef.current = false
    setState('exporting')
    // Give the UI time to render the Cancel button before sync work
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 150))
      if (cancelRef.current) return
    }

    try {
      const sceneGroup = viewportRef.current?.getSceneGroup()
      if (!sceneGroup) {
        setError('No character scene available')
        setState('error')
        return
      }

      const { buffer } = await exportCharacter(sceneGroup, dna, profile, characterName)

      const electronAPI = (
        window as unknown as Window & {
          electronAPI: {
            export: {
              execute: (
                params: unknown
              ) => Promise<{ ok: boolean; filePath?: string; error?: string }>
            }
          }
        }
      ).electronAPI

      const result = await electronAPI.export.execute({
        buffer,
        fileName: characterName,
        profileName: profile.id,
        characterDna: JSON.stringify(dna)
      })

      if (!mountedRef.current) return

      if (result.ok) {
        setFilePath(result.filePath ?? '')
        setState('success')
      } else {
        setError(result.error ?? 'Export failed')
        setState('error')
      }
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }, [dna, characterName, profile, viewportRef])

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <div style={overlayStyle} onClick={close}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {state === 'form' && (
          <>
            <h3 style={{ margin: '0 0 12px', color: '#eee', fontSize: 14 }}>Export Character</h3>

            {validation && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>Validation</div>
                <div style={{ fontSize: 12 }}>
                  <CheckItem pass label="Body slot" ok={validation.bodySlotFilled} />
                  <CheckItem pass label="Head slot" ok={validation.headSlotFilled} />
                  <CheckItem pass label="Meshes present" ok={validation.meshesPresent} />
                </div>
                <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>Game Ready Score:</span>
                  <span style={{
                    fontWeight: 600,
                    color: validation.bodySlotFilled && validation.headSlotFilled && validation.meshesPresent ? '#4caf50' : '#ff9800'
                  }}>
                    {[validation.bodySlotFilled, validation.headSlotFilled, validation.meshesPresent].filter(Boolean).length}/3 (
                    {Math.round([validation.bodySlotFilled, validation.headSlotFilled, validation.meshesPresent].filter(Boolean).length / 3 * 100)}%)
                  </span>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>Export Profile</div>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                style={selectStyle}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{profile.description}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button style={cancelBtnStyle} onClick={() => onEditProfiles?.()}>
                Edit Profiles
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={cancelBtnStyle} onClick={close}>
                  Cancel
                </button>
                <button
                  style={exportBtnStyle}
                  onClick={handleExport}
                  disabled={!dna || !characterName}
                >
                  Export
                </button>
              </div>
            </div>
          </>
        )}

        {state === 'exporting' && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ color: '#ccc', fontSize: 13 }}>Exporting...</div>
            <button style={cancelBtnStyle} onClick={handleCancelExport}>
              Cancel
            </button>
          </div>
        )}

        {state === 'success' && (
          <div>
            <h3 style={{ margin: '0 0 12px', color: '#4caf50', fontSize: 14 }}>
              Export Successful
            </h3>
            <div style={{ fontSize: 12, color: '#ccc', wordBreak: 'break-all' }}>{filePath}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                style={{ ...exportBtnStyle, background: '#333', color: '#ccc' }}
                onClick={close}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div>
            <h3 style={{ margin: '0 0 12px', color: '#f44336', fontSize: 14 }}>Export Failed</h3>
            <div style={{ fontSize: 12, color: '#ccc' }}>{error}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button style={cancelBtnStyle} onClick={() => setState('form')}>
                Back
              </button>
              <button
                style={{ ...exportBtnStyle, background: '#333', color: '#ccc' }}
                onClick={close}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckItem({ label, ok }: { pass?: true; label: string; ok: boolean }) {
  const icon = ok ? '\u2713' : '\u26A0'
  const color = ok ? '#4caf50' : '#ff9800'
  return (
    <div style={{ color, marginBottom: 2 }}>
      {icon} {label}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const dialogStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #444',
  borderRadius: 8,
  padding: 20,
  minWidth: 380,
  maxWidth: 460
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#ccc',
  fontSize: 12
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#2a2a2a',
  color: '#ccc',
  fontSize: 12,
  cursor: 'pointer'
}

const exportBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #4caf50',
  background: '#2a2a2a',
  color: '#4caf50',
  fontSize: 12,
  cursor: 'pointer'
}
