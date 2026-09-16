/**
 * PDF Magic Bytes and File Validation
 */

export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per design doc §3

export interface PdfValidationResult {
  isValid: boolean;
  fileSizeBytes: number;
  error?: string;
}

/**
 * Checks if the binary begins with the standard PDF magic bytes: '%PDF-' (0x25, 0x50, 0x44, 0x46)
 */
export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  // %PDF-
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

/**
 * Validate PDF buffer against magic bytes and size constraints
 */
export function validatePdfFile(
  bytes: Uint8Array,
  maxSizeBytes = MAX_PDF_SIZE_BYTES
): PdfValidationResult {
  const fileSizeBytes = bytes.byteLength;

  if (fileSizeBytes === 0) {
    return {
      isValid: false,
      fileSizeBytes,
      error: "The selected file is empty (0 bytes).",
    };
  }

  if (fileSizeBytes > maxSizeBytes) {
    const sizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      fileSizeBytes,
      error: `File size (${sizeMb} MB) exceeds maximum allowed limit (${maxMb} MB).`,
    };
  }

  if (!hasPdfMagicBytes(bytes)) {
    return {
      isValid: false,
      fileSizeBytes,
      error: "Invalid file format: File header does not contain standard PDF magic bytes (%PDF-).",
    };
  }

  return {
    isValid: true,
    fileSizeBytes,
  };
}
