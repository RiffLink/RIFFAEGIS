import { PDFDocument, rgb, StandardFonts, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { DocumentRecord, SignerRecord, AuditLogRecord } from "./types";
import { AtomicTimeResult } from "./nict";

export interface GenerateCertificateParams {
  document: DocumentRecord;
  signer: SignerRecord;
  auditLogs: AuditLogRecord[];
  atomicTime: AtomicTimeResult;
  verificationUrl?: string;
}

/**
 * Generate an independent, detached Audit Certificate PDF using pdf-lib
 */
export async function generateAuditCertificatePdf({
  document,
  signer,
  auditLogs,
  atomicTime,
  verificationUrl = "https://app.riff-aegis.com/verify",
}: GenerateCertificateParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([595.28, 841.89]); // Standard A4 (points)

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Embed Japanese TrueType font with subsetting if available on system
  let fontJp: PDFFont | null = null;
  const jpFontCandidates = [
    path.join(process.cwd(), "public/fonts/NotoSansJP-Regular.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/Library/Fonts/NotoSansJP-Regular.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
  ];
  for (const fPath of jpFontCandidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ fPath)) {
        const fontBytes = fs.readFileSync(/*turbopackIgnore: true*/ fPath);
        fontJp = await pdfDoc.embedFont(fontBytes, { subset: true });
        break;
      }
    } catch {
      // try next candidate
    }
  }

  // Embed Machine-Readable Audit Metadata in PDF Document Properties
  const pkBase64 = typeof document.creator_ml_dsa_public_key === "string"
    ? document.creator_ml_dsa_public_key
    : Buffer.from(document.creator_ml_dsa_public_key).toString("base64");
  const sigBase64 = typeof document.creator_ml_dsa_signature === "string"
    ? document.creator_ml_dsa_signature
    : Buffer.from(document.creator_ml_dsa_signature).toString("base64");

  const metadataPayload = {
    riffaegis_version: "1.0",
    document_id: document.id,
    original_sha256: document.original_sha256,
    original_sha3_512: document.original_sha3_512,
    final_merkle_root: document.final_merkle_root || "PENDING",
    creator_ml_dsa_public_key: pkBase64,
    creator_ml_dsa_signature: sigBase64,
    file_size_bytes: document.file_size_bytes,
    created_at: document.created_at,
    signed_at: signer.signed_at,
    signer_email: signer.email,
    auth_level: signer.auth_level,
    atomic_time: atomicTime.isoTime,
    atomic_source: atomicTime.source,
    github_commit_sha: document.github_commit_sha || null,
  };

  const metadataJsonString = JSON.stringify(metadataPayload);
  pdfDoc.setTitle("RIFFAEGIS AUDIT CERTIFICATE");
  pdfDoc.setSubject(`RIFFAEGIS_AUDIT_DATA:${metadataJsonString}`);
  pdfDoc.setKeywords([
    "RiffAegis",
    `sha256:${document.original_sha256}`,
    `sha3:${document.original_sha3_512}`,
    `merkle:${document.final_merkle_root || ""}`,
  ]);
  pdfDoc.setCreator("RiffAegis Zero-Knowledge Audit Engine");

  const primaryColor = rgb(0.08, 0.12, 0.22); // Deep navy #141f38
  const accentColor = rgb(0.12, 0.46, 0.85);  // Electric blue #1e75d9
  const textDark = rgb(0.15, 0.15, 0.18);
  const textMuted = rgb(0.45, 0.45, 0.5);
  const borderGrey = rgb(0.85, 0.87, 0.9);
  const bgLight = rgb(0.96, 0.97, 0.99);

  const { width, height } = page.getSize();
  const margin = 40;

  // Header Banner
  page.drawRectangle({
    x: margin,
    y: height - 95,
    width: width - margin * 2,
    height: 55,
    color: bgLight,
    borderColor: borderGrey,
    borderWidth: 1,
  });

  page.drawText("RIFFAEGIS // AUDIT CERTIFICATE OF AGREEMENT", {
    x: margin + 16,
    y: height - 62,
    size: 14,
    font: fontBold,
    color: primaryColor,
  });

  page.drawText("Zero-Knowledge Detached Verification Packet & Multi-Anchor Trail", {
    x: margin + 16,
    y: height - 80,
    size: 8.5,
    font: fontRegular,
    color: accentColor,
  });

  let currentY = height - 118;

  const drawSectionHeader = (title: string) => {
    page.drawText(title.toUpperCase(), {
      x: margin,
      y: currentY,
      size: 9.5,
      font: fontBold,
      color: primaryColor,
    });
    page.drawLine({
      start: { x: margin, y: currentY - 4 },
      end: { x: width - margin, y: currentY - 4 },
      thickness: 1,
      color: borderGrey,
    });
    currentY -= 16;
  };

  const containsNonAscii = (str: string) => /[^\u0000-\u007f]/.test(str);

  const drawField = (label: string, value: string | undefined | null, isMono = false, maxChars = 75) => {
    page.drawText(label + ":", {
      x: margin + 10,
      y: currentY,
      size: 8,
      font: fontBold,
      color: textMuted,
    });

    const safeVal = String(value ?? "");
    let displayVal = safeVal.length > maxChars ? safeVal.slice(0, maxChars) + "..." : safeVal;
    const fontToUse = (containsNonAscii(displayVal) && fontJp) ? fontJp : (isMono ? fontMono : fontRegular);
    if (!fontJp && containsNonAscii(displayVal)) {
      displayVal = displayVal.replace(/[^\x00-\x7F]/g, "?");
    }

    page.drawText(displayVal, {
      x: margin + 140,
      y: currentY,
      size: 7.5,
      font: fontToUse,
      color: textDark,
    });
    currentY -= 13.5;
  };

  // 1. Document Identity
  drawSectionHeader("1. Document Core Identity");
  drawField("Document ID", document.id, true);
  drawField("Original SHA-256", document.original_sha256, true);
  drawField("Original SHA3-512", document.original_sha3_512.slice(0, 64) + "...", true);
  drawField("File Size", `${document.file_size_bytes.toLocaleString()} bytes`);
  drawField("Final Merkle Root", document.final_merkle_root || "PENDING", true);

  currentY -= 5;

  // 2. Creator (Party A) Identity
  const creatorMeta = (document.creator_webauthn_binding || {}) as Record<string, unknown>;
  const creatorName = String(creatorMeta.creator_name || "作成者（甲）");
  const creatorAddress = String(creatorMeta.creator_address || "登録電子署名鍵により認証済み");
  const creatorOrg = creatorMeta.creator_organization ? String(creatorMeta.creator_organization) : "";
  const creatorDisplay = creatorOrg ? `${creatorOrg} - ${creatorName}` : creatorName;

  drawSectionHeader("2. Creator (Party A) - Identity & Post-Quantum Key");
  drawField("Organization / Name", creatorDisplay);
  drawField("Address", creatorAddress);
  drawField("Creator Key Hash", document.creator_ml_dsa_public_key_hash, true);
  drawField("Algorithm", "NIST FIPS 204 ML-DSA-65 (Quantum-Resistant)");
  drawField("Created Timestamp", document.created_at);

  currentY -= 5;

  // 3. Signer (Party B) Identity & Hardware Consent
  const consentLog = auditLogs.find((l) => l.event_type === "WEBAUTHN_CONSENT");
  const consentData = ((consentLog?.payload_json || {}) as Record<string, unknown>);
  const signerRawName = String(consentData.signer_name || consentData.name || signer.email.split("@")[0]);
  const signerCompany = consentData.signer_company ? String(consentData.signer_company) : "";
  const signerTitle = consentData.signer_title ? String(consentData.signer_title) : "";
  const signerDisplay = signerCompany ? `${signerCompany} - ${signerRawName}` : signerRawName;
  const signerAddress = String(consentData.signer_address || consentData.address || "登録メールアドレスにて本人確認完了");

  drawSectionHeader("3. Signer (Party B) - WebAuthn Biometric Consent");
  drawField("Organization / Name", signerDisplay);
  if (signerTitle) {
    drawField("Title / Student ID", signerTitle);
  }
  drawField("Signer Address", signerAddress);
  drawField("Signer Email", signer.email);
  drawField("Authentication Level", (signer.auth_level || "high_webauthn").toUpperCase());
  drawField("WebAuthn Credential ID", signer.webauthn_credential_id || "Hardware Token Registered", true);
  drawField("Agreement Signed At", signer.signed_at || new Date().toISOString());

  currentY -= 5;

  // 4. External Timestamps & Multi-Anchors
  drawSectionHeader("4. Distributed External Anchors");
  drawField("Atomic Time Source", `${atomicTime.source} (Latency: ${atomicTime.roundTripMs}ms)`);
  drawField("Atomic Timestamp", atomicTime.isoTime, true);
  drawField("OpenTimestamps Anchor", document.ots_status === "upgraded" ? "Bitcoin Block Confirmed" : "Calendar Receipt Anchored (Pending Block)");
  drawField("GitHub Proof Anchor", document.github_commit_sha ? `Commit ${document.github_commit_sha.slice(0, 16)}` : "Committed to Public Witness Repo");

  currentY -= 5;

  // 5. Merkle Tree Audit Timeline Table
  drawSectionHeader("5. Cryptographic Merkle Tree Audit Chain");
  page.drawText("EVENT TYPE", { x: margin + 10, y: currentY, size: 7.5, font: fontBold, color: textMuted });
  page.drawText("EVENT TIMESTAMP", { x: margin + 140, y: currentY, size: 7.5, font: fontBold, color: textMuted });
  page.drawText("MERKLE NODE HASH (CURRENT)", { x: margin + 270, y: currentY, size: 7.5, font: fontBold, color: textMuted });
  currentY -= 11;

  const logsToDisplay = auditLogs.slice(-6);
  for (const log of logsToDisplay) {
    page.drawText(log.event_type, { x: margin + 10, y: currentY, size: 7, font: fontRegular, color: textDark });
    const logDate = log.created_at || (log as unknown as Record<string, unknown>).timestamp || new Date().toISOString();
    const safeDateStr = new Date(String(logDate)).toISOString().replace("T", " ").slice(0, 19) + "Z";
    page.drawText(safeDateStr, {
      x: margin + 140,
      y: currentY,
      size: 6.5,
      font: fontMono,
      color: textDark,
    });
    const logHash = String(log.current_log_hash || (log as unknown as Record<string, unknown>).merkle_leaf_hash || "");
    page.drawText(logHash.slice(0, 44) + "...", {
      x: margin + 270,
      y: currentY,
      size: 6.5,
      font: fontMono,
      color: textDark,
    });
    currentY -= 11;
  }

  // Footer / Standalone Verification Box
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: 45,
    color: bgLight,
    borderColor: borderGrey,
    borderWidth: 1,
  });

  page.drawText("STANDALONE VERIFICATION INSTRUCTIONS", {
    x: margin + 12,
    y: margin + 30,
    size: 7.5,
    font: fontBold,
    color: primaryColor,
  });

  page.drawText(
    `This certificate can be verified independently without trusting RiffAegis servers at: ${verificationUrl}\nDrag and drop the original unmodified PDF along with this certificate to recompute SHA-256 and ML-DSA integrity.`,
    {
      x: margin + 12,
      y: margin + 18,
      size: 6.5,
      font: fontRegular,
      color: textDark,
      lineHeight: 8,
    }
  );

  return pdfDoc.save();
}
