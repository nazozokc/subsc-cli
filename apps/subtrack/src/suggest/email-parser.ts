/**
 * Minimal email content extraction from raw text/EML input.
 *
 * Handles:
 * - Plain text (treat entire content as body)
 * - EML (RFC822) — extracts subject, from, date, text body
 */

import type { RawEmail } from "./types.ts"

/**
 * Parse raw email content into structured RawEmail.
 * Supports plain text and basic EML format.
 */
export function parseEmailContent(
  raw: string,
  id: string,
): RawEmail {
  // Check if it looks like an EML (has email headers)
  if (looksLikeEml(raw)) {
    return parseEml(raw, id)
  }
  // Treat as plain text body
  return {
    id,
    from: null,
    subject: null,
    date: null,
    textBody: raw,
  }
}

function looksLikeEml(text: string): boolean {
  // EML files start with RFC822 headers
  return /^(From|Return-Path|Received|Date|Subject|From|To|Message-ID|MIME-Version):/im.test(text)
}

function parseEml(raw: string, id: string): RawEmail {
  // Split headers and body (CRLF or LF)
  const headerEnd = raw.search(/\r?\n\r?\n/)
  const headerSection = headerEnd === -1 ? raw : raw.slice(0, headerEnd)
  const bodySection = headerEnd === -1 ? "" : raw.slice(headerEnd + (raw[headerEnd] === '\r' ? 4 : 2))

  const headers = parseHeaders(headerSection)
  const textBody = extractTextBody(bodySection)

  // Parse date
  let date: Date | null = null
  const dateStr = headers.get("date")
  if (dateStr) {
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) date = parsed
  }

  return {
    id,
    from: headers.get("from") ?? null,
    subject: decodeMimeHeader(headers.get("subject") ?? null),
    date,
    textBody,
  }
}

function parseHeaders(headerSection: string): Map<string, string> {
  const headers = new Map<string, string>()
  let currentKey = ""
  let currentValue = ""

  for (const line of headerSection.split("\n")) {
    const trimmed = line.replace(/\r$/, "")
    // Continuation line (starts with space or tab)
    if (/^[ \t]/.test(trimmed)) {
      currentValue += " " + trimmed.trim()
      continue
    }
    // Save previous header
    if (currentKey) {
      headers.set(currentKey.toLowerCase(), currentValue.trim())
    }
    // New header
    const match = trimmed.match(/^([^:]+):\s*(.*)/)
    if (match) {
      currentKey = match[1]
      currentValue = match[2]
    } else {
      currentKey = ""
      currentValue = ""
    }
  }
  // Save last header
  if (currentKey) {
    headers.set(currentKey.toLowerCase(), currentValue.trim())
  }

  return headers
}

/**
 * Extract text content from email body.
 * Handles multipart boundaries and base64/qp encodings simply.
 */
function extractTextBody(body: string): string {
  // Check for multipart
  const boundaryMatch = body.match(/--(=?[^\s]+)/)
  if (boundaryMatch) {
    return extractFromMultipart(body, boundaryMatch[1])
  }

  // Check for base64 content (Content-Transfer-Encoding: base64)
  if (/content-transfer-encoding:\s*base64/i.test(body.slice(0, 500))) {
    return decodeBase64Body(body)
  }

  // If the body looks like MIME headers (no blank line before content),
  // try to find the actual content after the MIME section
  if (/content-type|content-transfer-encoding/i.test(body.slice(0, 300))) {
    const parts = body.split(/\r?\n\r?\n/)
    // Skip past MIME headers
    for (let i = 1; i < parts.length; i++) {
      if (!/content-type|content-transfer-encoding|charset|base64|quoted-printable/i.test(parts[i].slice(0, 200))) {
        return parts[i].trim()
      }
    }
    return parts[parts.length - 1].trim()
  }

  // Simple plain text or quoted-printable body
  return decodeQp(body).trim()
}

function extractFromMultipart(body: string, boundary: string): string {
  const parts = body.split(`--${boundary}`)
  let textPart = ""

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower.includes("text/plain") && !lower.includes("text/html")) {
      // Extract content after the header block (CRLF or LF)
      const contentStart = part.search(/\r?\n\r?\n/)
      if (contentStart !== -1) {
        textPart = part.slice(contentStart + (part[contentStart] === '\r' ? 4 : 2)).trim()
        break
      }
    }
  }

  // Fallback to first non-HTML part
  if (!textPart) {
    for (const part of parts) {
      const lower = part.toLowerCase()
      if (!lower.includes("text/html") && !lower.includes("multipart")) {
        const contentStart = part.search(/\r?\n\r?\n/)
        if (contentStart !== -1) {
          textPart = part.slice(contentStart + (part[contentStart] === '\r' ? 4 : 2)).trim()
          break
        }
      }
    }
  }

  return decodeQp(textPart)
}

function decodeBase64Body(body: string): string {
  // Find the base64 content (after the last blank line in the MIME section)
  const parts = body.split(/\r?\n\r?\n/)
  const b64 = parts[parts.length - 1].replace(/\s/g, "")
  try {
    return Buffer.from(b64, "base64").toString("utf-8").trim()
  } catch {
    return body
  }
}

/** Minimal quoted-printable decoder. */
function decodeQp(text: string): string {
  return text
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/=\r?\n/g, "")
}

/** Minimal MIME encoded-word decoder for Subject/From headers.
 * Supports both Base64 (?B?) and Quoted-printable (?Q?) encoding,
 * respecting the declared charset. */
function decodeMimeHeader(header: string | null): string | null {
  if (!header) return null
  return header.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset: string, encoding: string, encoded: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          return Buffer.from(encoded, "base64").toString("utf-8")
        }
        // Q-encoding: replace _ with space, decode =FF hex escapes
        const qDecoded = encoded
          .replace(/_/g, " ")
          .replace(/=([0-9A-Fa-f]{2})/g, (__, hex) => String.fromCharCode(parseInt(hex, 16)))
        // Try to decode using the declared charset; fall back to utf-8
        try {
          return Buffer.from(qDecoded, "latin1").toString(charset.toLowerCase() === "iso-2022-jp" ? "utf-8" : charset as BufferEncoding)
        } catch {
          return qDecoded
        }
      } catch {
        return _
      }
    },
  )
}
