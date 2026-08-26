import { useState, useEffect, useRef } from 'react'
import type { SlotDefinition } from '../../shared/types/slot'
import type { ValidationReport } from '../services/ImportValidator'
import { validateGLB } from '../services/ImportValidator'
import { generateThumbnail } from '../services/ThumbnailGenerator'
import { useSlotStore } from '../stores/useSlotStore'
import { useAssetStore } from '../stores/useAssetStore'

type Stage = 'picking' | 'validating' | 'metadata' | 'confirming' | 'done' | 'error'

interface ImportFileData {
  assetId: string
  fileName: string
  formatValid: boolean
  buffer: ArrayBuffer
  validation?: ValidationReport
  thumbnailUrl?: string
}

interface ImportDialogProps {
  onClose: () => void
  initialFileData?: { buffer: ArrayBuffer; fileName: string }
}

export default function ImportDialog({ onClose, initialFileData }: ImportDialogProps) {
  const [stage, setStage] = useState<Stage>(initialFileData ? 'validating' : 'picking')
  const [fileData, setFileData] = useState<ImportFileData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const prevSlotRef = useRef('')
  const [version, setVersion] = useState(1)
  const startedRef = useRef(false)
  const [extension, setExtension] = useState('.glb')

  const slotStore = useSlotStore.getState()
  const slots = slotStore.slots
  const loadSlots = slotStore.loadSlots

  useEffect(() => {
    if (slots.length === 0) {
      loadSlots()
    }
  }, [slots.length, loadSlots])

  async function validateBuffer(
    buffer: ArrayBuffer,
    fileName: string,
    assetId: string,
    formatValid: boolean
  ) {
    const ext = fileName.includes('.')
      ? fileName.substring(fileName.lastIndexOf('.'))
      : '.glb'
    setExtension(ext)

    setFileData({ assetId, fileName, formatValid, buffer })

    if (!formatValid) {
      setStage('metadata')
      return
    }

    setStage('validating')

    const [validation, thumbnailUrl] = await Promise.all([
      validateGLB(buffer),
      generateThumbnail(buffer)
    ])

    setFileData((prev) => (prev ? { ...prev, validation, thumbnailUrl } : null))
    setStage('metadata')
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    if (initialFileData) {
      const { buffer, fileName } = initialFileData
      if (!fileName.toLowerCase().endsWith('.glb')) {
        setErrorMessage('Only GLB files are supported. Convert GLTF to GLB with:\n  npx @gltf-transform/cli optimize input.gltf output.glb')
        setStage('error')
        return
      }
      const assetId = crypto.randomUUID()
      validateBuffer(buffer, fileName, assetId, true)
      return
    }

    ;(async () => {
      try {
        const result = await window.electronAPI.import.pickFile()
        if (!result) {
          onClose()
          return
        }

        await validateBuffer(result.buffer, result.fileName, result.assetId, result.formatValid)
      } catch (err) {
        setErrorMessage((err as Error).message)
        setStage('error')
      }
    })()
  }, [onClose, initialFileData])

  async function handleConfirm() {
    if (!fileData) return
    setStage('confirming')

    try {
      const result = await window.electronAPI.import.confirm({
        assetId: fileData.assetId,
        slotId: selectedSlot,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        version,
        thumbnailDataUrl: fileData.thumbnailUrl ?? null,
        extension,
        fileBuffer: fileData.buffer
      })

      if (result.ok) {
        await useAssetStore.getState().queryAssets()
        setStage('done')
      } else {
        setErrorMessage(result.error)
        setStage('error')
      }
    } catch (err) {
      setErrorMessage((err as Error).message)
      setStage('error')
    }
  }

  useEffect(() => {
    if (selectedSlot === 'body' && prevSlotRef.current !== 'body') {
      setTagsInput((prev) => {
        const existing = prev.split(',').map((t) => t.trim()).filter(Boolean)
        if (!existing.includes('base_body')) {
          existing.push('base_body')
          return existing.join(', ')
        }
        return prev
      })
    }
    prevSlotRef.current = selectedSlot
  }, [selectedSlot])

  const validation = fileData?.validation
  const hasErrors = validation?.issues.some((i) => i.type === 'error') ?? false

  return (
    <div style={overlayStyle} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {stage === 'picking' && <p>Selecting file...</p>}
        {stage === 'validating' && <p>Validating asset...</p>}
        {stage === 'confirming' && <p>Importing asset...</p>}

        {stage === 'error' && (
          <div>
            <h3 style={{ color: '#e55', margin: '0 0 8px' }}>Error</h3>
            <p style={{ margin: 0 }}>{errorMessage}</p>
            <button style={buttonStyle} onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {stage === 'done' && (
          <div>
            <h3 style={{ color: '#5e5', margin: '0 0 8px' }}>Import Complete</h3>
            <p style={{ margin: 0 }}>Asset has been imported and indexed.</p>
            <button style={buttonStyle} onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {stage === 'metadata' && fileData && (
          <div>
            <h3 style={{ margin: '0 0 12px' }}>Import: {fileData.fileName}</h3>

            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              {fileData.thumbnailUrl && (
                <img
                  src={fileData.thumbnailUrl}
                  alt="Preview"
                  style={{ width: 128, height: 128, borderRadius: 6, background: '#333' }}
                />
              )}
              {!fileData.formatValid && (
                <div style={{ color: '#e55', fontSize: 13, alignSelf: 'center' }}>
                  Not a valid GLB 2.0 file
                </div>
              )}
            </div>

            {validation && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                  Validation
                  {hasErrors
                    ? ' \u274c'
                    : validation.issues.length > 0
                      ? ' \u26a0\ufe0f'
                      : ' \u2705'}
                </div>
                {validation.issues.length === 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: '#5e5' }}>All checks passed</p>
                )}
                {validation.issues.map((issue, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      color: issue.type === 'error' ? '#e55' : '#ea5',
                      marginLeft: 8
                    }}
                  >
                    {issue.type === 'error' ? '\u2716' : '\u26a0'} {issue.message}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                Slot
              </label>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a slot...</option>
                {slots.map((s: SlotDefinition) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="fantasy, male, cartoon"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                Version
              </label>
              <input
                type="number"
                min={1}
                value={version}
                onChange={(e) => setVersion(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ ...inputStyle, width: 80 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...buttonStyle, background: '#555' }} onClick={onClose}>
                Cancel
              </button>
              <button
                style={{ ...buttonStyle, opacity: !selectedSlot || hasErrors ? 0.5 : 1 }}
                disabled={!selectedSlot || hasErrors}
                onClick={handleConfirm}
              >
                Import
              </button>
            </div>
          </div>
        )}
      </div>
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
  background: '#2a2a2a',
  color: '#ddd',
  borderRadius: 10,
  padding: 20,
  minWidth: 400,
  maxWidth: 500,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid #555',
  background: '#1a1a1a',
  color: '#ddd',
  fontSize: 13,
  boxSizing: 'border-box'
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  background: '#4488ff',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer'
}
