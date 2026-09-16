export interface AtomicTimeResult {
  isoTime: string;
  source: "NICT_HTTPS" | "GOOGLE_TIME" | "CLOUDFLARE_EDGE" | "SYSTEM_CLOCK";
  roundTripMs: number;
}

/**
 * Acquire atomic time with 3-tier HTTPS fallback:
 * 1. NICT Official HTTP Time API (ntp-a1.nict.go.jp) [1.5s timeout]
 * 2. Google Public Time HTTP [1.5s timeout]
 * 3. Cloudflare Edge Date header
 * 4. System clock fallback
 */
async function fetchNictTime(): Promise<AtomicTimeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  try {
    const res = await fetch("https://ntp-a1.nict.go.jp/cgi-bin/json", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.st === "number") {
        return {
          isoTime: new Date(data.st * 1000).toISOString(),
          source: "NICT_HTTPS",
          roundTripMs: Date.now() - start,
        };
      }
    }
    throw new Error("NICT invalid response");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGoogleTime(): Promise<AtomicTimeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  try {
    const res = await fetch("https://time.google.com", {
      method: "HEAD",
      signal: controller.signal,
    });
    const dateHeader = res.headers.get("date");
    if (res.ok && dateHeader) {
      return {
        isoTime: new Date(dateHeader).toISOString(),
        source: "GOOGLE_TIME",
        roundTripMs: Date.now() - start,
      };
    }
    throw new Error("Google time invalid response");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCloudflareTime(): Promise<AtomicTimeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  try {
    const res = await fetch("https://1.1.1.1", {
      method: "HEAD",
      signal: controller.signal,
    });
    const dateHeader = res.headers.get("date");
    if (dateHeader) {
      return {
        isoTime: new Date(dateHeader).toISOString(),
        source: "CLOUDFLARE_EDGE",
        roundTripMs: Date.now() - start,
      };
    }
    throw new Error("Cloudflare time invalid response");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Acquire atomic time with concurrent multi-source racing:
 * NICT, Google Public Time, and Cloudflare queried in parallel; fastest one wins!
 */
export async function getAtomicTime(): Promise<AtomicTimeResult> {
  const start = Date.now();

  try {
    return await Promise.any([
      fetchNictTime(),
      fetchGoogleTime(),
      fetchCloudflareTime(),
    ]);
  } catch {
    // Immediate fallback to server local clock if all network time requests fail
    return {
      isoTime: new Date().toISOString(),
      source: "SYSTEM_CLOCK",
      roundTripMs: Date.now() - start,
    };
  }
}
