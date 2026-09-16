/**
 * RiffAegis Crypto Worker (Off-thread Cryptographic Engine)
 * Handles PDF hashing, AES-256-GCM encryption, and decryption without blocking the UI thread.
 */

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      case "HASH_SHA256": {
        const { buffer } = payload;
        const hashBuf = await self.crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuf));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        self.postMessage({ id, success: true, result: hashHex });
        break;
      }

      case "ENCRYPT_AES_GCM": {
        const { fileBytes, keyBytes } = payload;
        const iv = new Uint8Array(12);
        self.crypto.getRandomValues(iv);

        const cryptoKey = await self.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "AES-GCM" },
          false,
          ["encrypt"]
        );

        const ciphertextBuf = await self.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          fileBytes
        );

        const ciphertextBytes = new Uint8Array(ciphertextBuf);
        const encryptedBytes = new Uint8Array(iv.length + ciphertextBytes.length);
        encryptedBytes.set(iv, 0);
        encryptedBytes.set(ciphertextBytes, iv.length);

        const hashBuf = await self.crypto.subtle.digest("SHA-256", fileBytes);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

        self.postMessage(
          {
            id,
            success: true,
            result: {
              encryptedBytes,
              originalSha256: hashHex,
              fileSizeBytes: fileBytes.byteLength,
            },
          },
          [encryptedBytes.buffer]
        );
        break;
      }

      case "DECRYPT_AND_VERIFY": {
        const { encryptedBytes, keyBytes, expectedSha256 } = payload;
        const iv = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);

        const cryptoKey = await self.crypto.subtle.importKey(
          "raw",
          keyBytes,
          { name: "AES-GCM" },
          false,
          ["decrypt"]
        );

        const decryptedBuf = await self.crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          ciphertext
        );

        const decryptedBytes = new Uint8Array(decryptedBuf);
        const hashBuf = await self.crypto.subtle.digest("SHA-256", decryptedBytes);
        const actualSha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

        if (expectedSha256 && actualSha256 !== expectedSha256) {
          throw new Error("SHA-256 hash mismatch. Document corrupted or tampered.");
        }

        self.postMessage(
          {
            id,
            success: true,
            result: {
              decryptedBytes,
              verified: true,
              actualSha256,
            },
          },
          [decryptedBytes.buffer]
        );
        break;
      }

      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
