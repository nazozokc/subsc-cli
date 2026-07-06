import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import { Select } from "@inkjs/ui"
import { useState, useCallback, useMemo } from "react"
import { getSubscriptions } from "../../../db.ts"
import { exportCsv, exportJson, exportMd, exportExcel, exportIcs } from "../../../export.ts"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"
import { colors } from "../../theme.ts"
import type { SharedArgs } from "../../../types.ts"

type ExporterSync = { ext: string; fn: (subs: SharedArgs[]) => string; binary?: false }
type ExporterAsync = { ext: string; fn: (subs: SharedArgs[]) => Promise<Buffer>; binary: true }

const EXPORTERS: Record<string, ExporterSync | ExporterAsync> = {
  csv: { ext: "csv", fn: exportCsv },
  json: { ext: "json", fn: exportJson },
  md: { ext: "md", fn: exportMd },
  ics: { ext: "ics", fn: exportIcs },
  excel: { ext: "xlsx", fn: exportExcel, binary: true },
}

type Props = {
  refreshKey?: number
}

export function ExportTab({ refreshKey = 0 }: Props) {
  const [format, setFormat] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string>("")
  const subs = useMemo(() => getSubscriptions(), [refreshKey])

  const doExport = useCallback(async (fmt: string) => {
    setProcessing(true)
    try {
      const entry = EXPORTERS[fmt]
      if (!entry) { setResult(`Unknown format: ${fmt}`); return }

      const filename = `subtrack-export.${entry.ext}`
      const filePath = join(cwd(), filename)

      if ("binary" in entry && entry.binary) {
        const buf = await entry.fn(subs)
        writeFileSync(filePath, buf)
      } else {
        const fn = entry.fn as (subs: SharedArgs[]) => string
        const output = fn(subs)
        writeFileSync(filePath, output, "utf-8")
      }
      setResult(`Exported as ${fmt.toUpperCase()} to ${filePath}`)
    } catch (e: unknown) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setProcessing(false)
  }, [subs])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Export Subscriptions</Text></Box>
      {!format ? (
        <Select
          options={[
            { label: "CSV", value: "csv" },
            { label: "JSON", value: "json" },
            { label: "Markdown", value: "md" },
            { label: "Excel (.xlsx)", value: "excel" },
            { label: "iCal (.ics)", value: "ics" },
          ]}
          onChange={(v) => { setFormat(v); doExport(v) }}
        />
      ) : processing ? (
        <Text>
          <Spinner type="dots" /> Exporting…
        </Text>
      ) : (
        <Text color={result.startsWith("Error") ? colors.danger : colors.success}>{result}</Text>
      )}
    </Box>
  )
}
