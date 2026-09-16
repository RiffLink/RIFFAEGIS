import { SignJWT, jwtVerify, JWTPayload } from "jose";

const DEFAULT_DEV_SECRET = "riff-aegis-ultra-secure-development-jwt-secret-key-32b";
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("FATAL CONFIG ERROR: JWT_SECRET environment variable must be set in production mode.");
}
const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || DEFAULT_DEV_SECRET);

export interface CreatorDocumentTokenClaims extends JWTPayload {
  sub: string;
  document_id: string;
  ml_dsa_public_key_hash: string;
  role: "creator";
}

export interface CreatorIdentityTokenClaims extends JWTPayload {
  sub: string;
  ml_dsa_public_key_hash: string;
  role: "creator_admin";
}

export interface SignerSessionTokenClaims extends JWTPayload {
  sub: string;
  document_id: string;
  signer_id: string;
  email_verified: string;
  role: "signer";
}

/**
 * Issue creator document token (24h validity, document-scoped)
 */
export async function signCreatorDocumentToken(
  documentId: string,
  mlDsaPublicKeyHash: string
): Promise<string> {
  return new SignJWT({
    document_id: documentId,
    ml_dsa_public_key_hash: mlDsaPublicKeyHash,
    role: "creator",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`creator:doc:${documentId}`)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

/**
 * Issue creator identity token (24h validity, account/identity-scoped for dashboard)
 */
export async function signCreatorIdentityToken(
  mlDsaPublicKeyHash: string
): Promise<string> {
  return new SignJWT({
    ml_dsa_public_key_hash: mlDsaPublicKeyHash,
    role: "creator_admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`creator:id:${mlDsaPublicKeyHash}`)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

/**
 * Issue signer session token (3h validity, signer-scoped)
 */
export async function signSignerSessionToken(
  documentId: string,
  signerId: string,
  emailVerified: string,
  signingToken: string
): Promise<string> {
  return new SignJWT({
    document_id: documentId,
    signer_id: signerId,
    email_verified: emailVerified,
    role: "signer",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`signer:${signingToken}`)
    .setIssuedAt()
    .setExpirationTime("3h")
    .sign(secretKey);
}

/**
 * Verify any JWT and return payload
 */
export async function verifyToken<T extends JWTPayload>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, secretKey);
  return payload as T;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}
