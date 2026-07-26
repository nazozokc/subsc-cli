import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import { TextInput, Select } from "@inkjs/ui"
import { useState, useCallback, useEffect } from "react"
import { useSetFormActive } from "../../context/app-context.tsx"
import { getDbDir, getBackupFiles, restoreDb } from "../../../db.ts"
import { colors } from "../../theme.ts"
import { existsSync } from "node:fs"

export function RestoreTab() {
  const [step, setStep] = useState<"choose" | "confirm" | "processing" | "done">("choose")
  const [source, setSource] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const setFormActive = useSetFormActive()

  useEffect(() => {
    setFormActive(step !== "done")
  }, [step, setFormActive])

  const backups = getBackupFiles(getDbDir())
  const options = backups.map((b) => ({
    label: `${b.name} (${b.mtime?.toISOString()?.slice(0, 10) ?? "unknown"})`,
    value: b.path,
  }))

  const doRestore = useCallback(() => {
    if (!source || !existsSync(source)) {
      setResult("File not found")
      setStep("done")
      return
    }
    setStep("processing")
    queueMicrotask(() => {
      try {
        restoreDb(source)
        setResult(`Restored from ${source}`)
      } catch (e: unknown) {
        setResult(`Restore failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      setStep("done")
    })
  }, [source])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Restore Database</Text></Box>
      {step === "choose" && (
        <Box flexDirection="column" gap={1}>
          <Text color={colors.textDim}>Select a backup file:</Text>
          {options.length > 0 ? (
            <Select
              options={options}
              onChange={(v) => { setSource(v); setStep("confirm") }}
            />
          ) : (
            <Text color={colors.textDim}>No backups found</Text>
          )}
          <TextInput
            placeholder="Or enter path manually..."
            defaultValue={source}
            onChange={setSource}
            onSubmit={() => setStep("confirm")}
          />
        </Box>
      )}
      {step === "confirm" && (
        <Box flexDirection="column" gap={1}>
          <Text>
            Restore from <Text bold>{source}</Text>?
          </Text>
          <Text color={colors.textDim}>This will overwrite the current database.</Text>
          <Select
            options={[
              { label: "Yes, restore", value: "yes" },
              { label: "Cancel", value: "no" },
            ]}
            onChange={(v) => {
              if (v === "yes") doRestore()
              else setStep("choose")
            }}
          />
        </Box>
      )}
      {step === "processing" && (
        <Text>
          <Spinner type="dots" /> Restoring…
        </Text>
      )}
      {step === "done" && (
        <Text color={result?.startsWith("Restored") ? colors.success : colors.danger}>
          {result}
        </Text>
      )}
    </Box>
  )
}
