import { useRef, useState } from 'react'
import { FileUp, ClipboardPaste, FlaskConical, Settings, Loader2 } from 'lucide-react'
import { Button, Card, Notice, Screen, TopBar } from './ui'
import { parsePickList } from '../lib/pickList'
import { PICKLIST_ACCEPT, parsePickListFile } from '../lib/pickListPdf'
import { isTextFile } from '../lib/documentUpload'
import { sortByVaultOrder, type VaultWalk } from '../lib/vaultOrder'
import type { PickLine } from '../types'
import { SAMPLE_PICKLIST_CSV, SAMPLE_PICKLIST_NAME } from '../sample/proper4934'

export interface LoadedExtras {
  /** Dollar totals per line id read off a PDF's prices; seeds OrderState.lineTotals. */
  lineTotals?: Record<string, string>
}

interface Props {
  vaultWalk: VaultWalk
  onLoaded: (lines: PickLine[], sourceName: string, extras?: LoadedExtras) => void
  onSettings: () => void
}

export function LoadScreen({ vaultWalk, onLoaded, onSettings }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState<string | null>(null)

  const finish = (lines: PickLine[], warnings: string[], name: string, extras?: LoadedExtras) => {
    if (!lines.length) {
      setError(warnings[0] ?? 'No pick list lines found.')
      setWarnings([])
      return
    }
    setError(null)
    setWarnings(warnings)
    onLoaded(sortByVaultOrder(lines, vaultWalk), name, extras)
  }

  const ingest = (text: string, name: string) => {
    const { lines, warnings } = parsePickList(text)
    finish(lines, warnings, name)
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (isTextFile(f)) {
      ingest(await f.text(), f.name)
      return
    }
    setError(null)
    setWarnings([])
    setReading(f.name)
    try {
      const res = await parsePickListFile(f)
      if (!res.ok) {
        setError(res.message)
        return
      }
      finish(res.result.lines, res.result.warnings, f.name, { lineTotals: res.result.lineTotals })
    } finally {
      setReading(null)
      if (fileRef.current) fileRef.current.value = ''
    }
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
          Open the pick list PDF from Apex, a photo of the printed sheet, or the CSV export. The PDF carries potency and
          prices, so it fills in more. Works from Files, Drive, or an email attachment.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={PICKLIST_ACCEPT}
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button block disabled={reading !== null} onClick={() => fileRef.current?.click()}>
          {reading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
          {reading ? 'Reading…' : 'Choose PDF or CSV'}
        </Button>
        {reading && (
          <p className="text-sm text-gray-500" role="status">
            Reading {reading}. This takes a few seconds for a PDF or photo.
          </p>
        )}
        <Button block variant="secondary" disabled={reading !== null} onClick={() => setPasteOpen((v) => !v)}>
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
        <Notice tone="amber">
          These cases already shipped (manifests 0002077929 / 0002077937), so Metrc will reject them if you try to submit. Use the
          sample to check the form fill, not to create a transfer.
        </Notice>
        <Button block variant="secondary" onClick={() => ingest(SAMPLE_PICKLIST_CSV, SAMPLE_PICKLIST_NAME)}>
          Load sample order
        </Button>
      </Card>
    </Screen>
  )
}
