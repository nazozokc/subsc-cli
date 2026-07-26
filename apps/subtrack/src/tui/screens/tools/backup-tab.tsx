import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import { TextInput, Select } from "@inkjs/ui"
import { useState, useCallback, useEffect } from "react"
import { useSetFormActive } from "../../context/app-context.tsx"
import { saveDb, getDbDir, getDefaultBackupDir } from "../../../db.ts"
import { encryptBuffer, hasEncryptionKey } from "../../../crypto.ts"
import { colors } from "../../theme.ts"
import { writeFileSync, readFileSync, copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

export function BackupTab() {
  const [step, setStep] = useState<"path" | "encrypt" | "processing" | "done">("path")
  const [dest, setDest] = useState(getDefaultBackupDir())
  const [result, setResult] = useState<string | null>(null)
  const setFormActive = useSetFormActive()

  useEffect(() => {
    setFormActive(step !== "done")
  }, [step, setFormActive])

  const doBackup = useCallback((encrypt: boolean) => {
    if (encrypt && !hasEncryptionKey()) {
      setResult("Cannot encrypt: no encryption key configured. Run 'subtrack backup' in CLI to set up encryption.")
      setStep("done")
      return
    }
    setStep("processing")
    queueMicrotask(() => {
      try {
        saveDb()
        mkdirSync(dest, { recursive: true })
        const ts = new Date().toISOString().replace(/[:.]/g, "-")
        const destPath = join(dest, `subtrack-${ts}.db`)
        const dbPath = join(getDbDir(), "subtrack.db")

        if (encrypt) {
          const data = readFileSync(dbPath)
          const encrypted = encryptBuffer(data)
          writeFileSync(destPath, encrypted)
        } else {
          copyFileSync(dbPath, destPath)
        }
        setResult(`Backup saved to ${destPath}`)
      } catch (e: unknown) {
        setResult(`Backup failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      setStep("done")
    })
  }, [dest])

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold underline>Backup Database</Text></Box>
      {step === "path" && (
        <TextInput
          placeholder="Backup destination directory..."
          defaultValue={dest}
          onChange={setDest}
          onSubmit={() => setStep("encrypt")}
        />
      )}
      {step === "encrypt" && (
        <Box flexDirection="column" gap={1}>
          <Text color={colors.textDim}>Encrypt backup?</Text>
          <Select
            options={[
              { label: "Yes, encrypt", value: "yes" },
              { label: "No, plain copy", value: "no" },
            ]}
            onChange={(v) => { doBackup(v === "yes") }}
          />
        </Box>
      )}
      {step === "processing" && (
        <Text>
          <Spinner type="dots" /> Creating backup…
        </Text>
      )}
      {step === "done" && (
        <Text color={result?.startsWith("Backup") ? colors.success : colors.danger}>{result}</Text>
      )}
    </Box>
  )
}
