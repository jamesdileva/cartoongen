import { type ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

interface LayoutShellProps {
  leftPanel: ReactNode
  centerPanel: ReactNode
  rightPanel: ReactNode
}

export default function LayoutShell({ leftPanel, centerPanel, rightPanel }: LayoutShellProps) {
  return (
    <Group direction="horizontal" style={{ flex: 1, minHeight: 0 }}>
      <Panel defaultSize="32" minSize="20" maxSize="45">
        <div
          style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {leftPanel}
        </div>
      </Panel>
      <Handle />
      <Panel defaultSize="36" minSize="25">
        <div style={{ height: '100%', overflow: 'hidden' }}>{centerPanel}</div>
      </Panel>
      <Handle />
      <Panel defaultSize="32" minSize="20" maxSize="45">
        <div
          style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {rightPanel}
        </div>
      </Panel>
    </Group>
  )
}

function Handle() {
  return (
    <Separator
      style={{
        width: 4,
        background: '#333',
        cursor: 'col-resize',
        flexShrink: 0
      }}
    />
  )
}
