/**
 * GitHub Permanent Audit Anchor
 * Commits Merkle Root and certificate fingerprint to a public GitHub repository
 */

export interface GitHubAnchorParams {
  documentId: string;
  finalMerkleRoot: string;
  originalSha256: string;
  timestampIso: string;
  atomicTimeSource: string;
}

export interface GitHubAnchorResult {
  commitSha: string;
  commitUrl?: string;
  isMock: boolean;
}

export async function createGitHubAnchor({
  documentId,
  finalMerkleRoot,
  originalSha256,
  timestampIso,
  atomicTimeSource,
}: GitHubAnchorParams): Promise<GitHubAnchorResult> {
  const pat = process.env.GITHUB_ANCHOR_PAT;
  const repo = process.env.GITHUB_ANCHOR_REPO; // e.g. "org/riffaegis-anchors"

  if (pat && repo) {
    try {
      const path = `anchors/${documentId}.json`;
      const contentObj = {
        document_id: documentId,
        final_merkle_root: finalMerkleRoot,
        original_sha256: originalSha256,
        anchored_at: timestampIso,
        atomic_time_source: atomicTimeSource,
        service: "RiffAegis Zero-Knowledge Fortress",
      };
      const contentBase64 = Buffer.from(JSON.stringify(contentObj, null, 2)).toString("base64");

      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "RiffAegis-Audit-Bot",
        },
        body: JSON.stringify({
          message: `anchor: RiffAegis Contract ${documentId.slice(0, 8)} [${finalMerkleRoot.slice(0, 16)}]`,
          content: contentBase64,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const commitSha = data.commit?.sha || data.content?.sha;
        return {
          commitSha,
          commitUrl: `https://github.com/${repo}/commit/${commitSha}`,
          isMock: false,
        };
      }
    } catch (err) {
      console.warn("GitHub anchor upload failed:", err);
    }
  }

  // Fallback deterministic Git commit identifier
  const mockSha = "git-anchor-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return {
    commitSha: mockSha,
    isMock: true,
  };
}
