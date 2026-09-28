import { useRef, useState } from 'react'
import { FileUp, ClipboardPaste, FlaskConical, Settings } from 'lucide-react'
import { Button, Card, Notice, Screen, TopBar } from './ui'
import { parsePickList } from '../lib/pickList'
import type { PickLine } from '../types'
import { SAMPLE_PICKLIST_CSV, SAMPLE_PICKLIST_NAME } from '../sample/proper4934'

interface Props {
  onLoaded: (lines: PickLine[], sourceName: string) => void
  onSettings: () => void
}

export function LoadScreen({ onLoaded, onSettings }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')

  const ingest = (text: string, name: string) => {
    const { lines, warnings } = parsePickList(text)
    if (!lines.length) {
      setError(warnings[0] ?? 'No pick list lines found.')
      setWarnings([])
      return
    }
    setError(null)
    setWarnings(warnings)
    onLoaded(lines, name)
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    ingest(await f.text(), f.name)
  }

  return (
    <Screen>
      <TopBar
        title="Manifest Picker"
        subtitle="Apex pick list → scan → Metrc transfer"
        right={
          <button type="button" onClick={onSettings} aria-label="Settings" className="h-10 w-10 inline-flex items-center justify-center rounded-full active:bg-gray-100 text-gray-600">
            <Settings className="h-5 w-5" />
          </button>
        }
      />

      <Card className="p-4 space-y-3">
        <h2 className="text-h2">Load a pick list</h2>
        <p className="text-sm text-gray-500">
          Export the pick list from Apex as CSV, then open it here. Works from Files, Drive, or an email attachment.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button block onClick={() => fileRef.current?.click()}>
          <FileUp className="h-5 w-5" /> Choose CSV file
        </Button>
        <Button block variant="secondary" onClick={() => setPasteOpen((v) => !v)}>
          <ClipboardPaste className="h-5 w-5" /> Paste CSV text
        </Button>
        {pasteOpen && (
          <div className="space-y-2">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='"Order Number","Brand",…'
              rows={6}
              className="w-full rounded-xl border border-gray-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <Button block disabled={!pasted.trim()} onClick={() => ingest(pasted, 'Pasted pick list')}>
              Load pasted text
            </Button>
          </div>
        )}
        {error && <Notice tone="red">{error}</Notice>}
        {warnings.map((w) => (
          <Notice key={w} tone="amber">
            {w}
          </Notice>
        ))}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-gray-700">
          <FlaskConical className="h-5 w-5 text-emerald-600" />
          <h3 className="text-subhead">Try it with a sample order</h3>
        </div>
        <p className="text-sm text-gray-500">
          Proper-4934 to Terrabis Springfield: 10 lines, 16 cases, 528 units. Case tags from Apex are included so you can
          compare against a real manifest.
        </p>
        <Button block variant="secondary" onClick={() => ingest(SAMPLE_PICKLIST_CSV, SAMPLE_PICKLIST_NAME)}>
          Load sample order
        </Button>
      </Card>
    </Screen>
  )
}
