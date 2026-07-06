import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import { TextInput } from "@inkjs/ui"
import { useState, useCallback, useEffect } from "react"
import { useSetFormActive } from "../../context/app-context.tsx"
import { writeSubscription } from "../../../db.ts"
import { parseCsvLine } from "../../../import-csv.ts"
import { isValidCurrency, isValidCycle } from "../../../prompts.ts"
import { colors } from "../../theme.ts"
import { readFileSync } from "node:fs"

export function ImportTab() {
  const [filePath, setFilePath] = useState("")
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const setFormActive = useSetFormActive()

  useEffect(() => {
    setFormActive(!result && !processing)
  }, [result, processing, setFormActive])

  const doImport = useCallback(() => {
    if (!filePath.trim()) { setResult("Please enter a file path"); return }
    setProcessing(true)
    queueMicrotask(() => {
      try {
        const content = readFileSync(filePath.trim(), "utf-8")
        const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
        const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean)

        let success = 0
        let failed = 0
        const errors: string[] = []
        for (let i = 1; i < lines.length; i++) {
          try {
            const fields = parseCsvLine(lines[i])
            if (fields.length < 5) { failed++; continue }
            if (!isValidCurrency(fields[4]) || !isValidCycle(fields[1])) { failed++; continue }
            const price = Number(fields[3])
            if (isNaN(price) || price < 0 || !Number.isInteger(price)) { failed++; errors.push(`Line ${i + 1}: invalid price "${fields[3]}"`); continue }
            writeSubscription({
              name: fields[0].trim(),
              price,
              currency: fields[4],
              cycle: fields[1],
              tags: fields[2].split(";").map((t) => t.trim()).filter(Boolean),
              status: "active",
            })
            success++
          } catch {
            failed++
          }
        }
        const msg = `Imported ${success} subscription${success !== 1 ? "s" : ""} from ${filePath}${failed > 0 ? ` (${failed} failed)` : ""}`
        setResult(errors.length > 0 ? `${msg}\n${errors.join("\n")}` : msg)
      } catch (e: unknown) {
        setResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
      }
      setProcessing(false)
    })
  }, [filePath])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Import from CSV</Text></Box>
      {processing ? (
        <Text>
          <Spinner type="dots" /> Importing…
        </Text>
      ) : result ? (
        <Text color={result.startsWith("Error") ? colors.danger : colors.success}>{result}</Text>
      ) : (
        <TextInput
          placeholder="Path to CSV file..."
          defaultValue={filePath}
          onChange={setFilePath}
          onSubmit={doImport}
        />
      )}
    </Box>
  )
}
