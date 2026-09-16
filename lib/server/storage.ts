import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.STORAGE_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET_NAME || "riff-aegis";
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

let s3Client: S3Client | null = null;
if (accessKeyId && secretAccessKey && endpoint) {
  s3Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// Supabase Storage fallback
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseStorageClient: SupabaseClient | null = null;
if (!s3Client && supabaseUrl && supabaseServiceKey) {
  supabaseStorageClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// In-Memory storage cache for local mock
const globalStorage = globalThis as unknown as { mockStorage?: Map<string, { bytes: Uint8Array; contentType: string }> };
export const mockStorage = globalStorage.mockStorage || new Map<string, { bytes: Uint8Array; contentType: string }>();
if (process.env.NODE_ENV !== "production") globalStorage.mockStorage = mockStorage;

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const storage = {
  isMock: !s3Client && !supabaseStorageClient,

  async getPresignedUploadUrl(
    key: string,
    contentType = "application/octet-stream",
    expiresIn = 900 // 15 minutes
  ): Promise<string> {
    if (s3Client) {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
      });
      return getSignedUrl(s3Client, command, { expiresIn });
    }
    if (supabaseStorageClient) {
      const { data, error } = await supabaseStorageClient.storage
        .from(bucketName)
        .createSignedUploadUrl(key);
      if (error || !data) throw new Error(error?.message || "Supabase upload URL error");
      return data.signedUrl;
    }
    // Return local mock upload URL
    return `${appUrl}/api/mock-storage?key=${encodeURIComponent(key)}`;
  },

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 900 // 15 minutes
  ): Promise<string> {
    if (s3Client) {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      return getSignedUrl(s3Client, command, { expiresIn });
    }
    if (supabaseStorageClient) {
      const { data, error } = await supabaseStorageClient.storage
        .from(bucketName)
        .createSignedUrl(key, expiresIn);
      if (error || !data) throw new Error(error?.message || "Supabase download URL error");
      return data.signedUrl;
    }
    // Return local mock download URL
    return `${appUrl}/api/mock-storage?key=${encodeURIComponent(key)}`;
  },

  async uploadBuffer(
    key: string,
    buffer: Uint8Array,
    contentType = "application/octet-stream"
  ): Promise<void> {
    if (s3Client) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      return;
    }
    if (supabaseStorageClient) {
      const { error } = await supabaseStorageClient.storage
        .from(bucketName)
        .upload(key, buffer, { contentType, upsert: true });
      if (error) throw new Error(error.message);
      return;
    }
    mockStorage.set(key, { bytes: buffer, contentType });
  },

  async downloadBuffer(key: string): Promise<Uint8Array | null> {
    if (s3Client) {
      try {
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        if (!response.Body) return null;
        const bytes = await response.Body.transformToByteArray();
        return new Uint8Array(bytes);
      } catch {
        return null;
      }
    }
    if (supabaseStorageClient) {
      try {
        const { data, error } = await supabaseStorageClient.storage
          .from(bucketName)
          .download(key);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      } catch {
        return null;
      }
    }
    const item = mockStorage.get(key);
    return item ? item.bytes : null;
  },

  async objectExists(key: string): Promise<boolean> {
    if (s3Client) {
      try {
        await s3Client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        return true;
      } catch {
        return false;
      }
    }
    if (supabaseStorageClient) {
      try {
        const { data } = await supabaseStorageClient.storage
          .from(bucketName)
          .list(key.split("/").slice(0, -1).join("/"));
        const filename = key.split("/").pop();
        return Array.isArray(data) && data.some((item) => item.name === filename);
      } catch {
        return false;
      }
    }
    return mockStorage.has(key);
  },

  async deleteObject(key: string): Promise<void> {
    if (s3Client) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
      } catch (err) {
        console.error(`Failed to delete S3 object: ${key}`, err);
      }
      return;
    }
    if (supabaseStorageClient) {
      try {
        await supabaseStorageClient.storage.from(bucketName).remove([key]);
      } catch (err) {
        console.error(`Failed to delete Supabase storage object: ${key}`, err);
      }
      return;
    }
    mockStorage.delete(key);
  },

  async deleteDocumentFiles(documentId: string): Promise<void> {
    const prefix = `documents/${documentId}/`;
    if (s3Client) {
      try {
        const list = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
          })
        );
        if (list.Contents && list.Contents.length > 0) {
          for (const item of list.Contents) {
            if (item.Key) {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: bucketName,
                  Key: item.Key,
                })
              );
            }
          }
        }
      } catch (err) {
        console.error(`Failed to delete S3 folder ${prefix}:`, err);
      }
      return;
    }
    if (supabaseStorageClient) {
      try {
        const { data } = await supabaseStorageClient.storage
          .from(bucketName)
          .list(`documents/${documentId}`);
        if (Array.isArray(data) && data.length > 0) {
          const filePaths = data.map((f) => `documents/${documentId}/${f.name}`);
          await supabaseStorageClient.storage.from(bucketName).remove(filePaths);
        }
      } catch (err) {
        console.error(`Failed to delete Supabase storage folder ${prefix}:`, err);
      }
      return;
    }
    for (const key of Array.from(mockStorage.keys())) {
      if (key.startsWith(prefix)) {
        mockStorage.delete(key);
      }
    }
  },

  async purgeAllFiles(): Promise<number> {
    let deletedCount = 0;
    if (s3Client) {
      try {
        const list = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: "documents/",
          })
        );
        if (list.Contents && list.Contents.length > 0) {
          deletedCount = list.Contents.length;
          for (const item of list.Contents) {
            if (item.Key) {
              await s3Client.send(
                new DeleteObjectCommand({
                  Bucket: bucketName,
                  Key: item.Key,
                })
              );
            }
          }
        }
      } catch (err) {
        console.error("Failed to purge all S3 files:", err);
      }
      return deletedCount;
    }
    if (supabaseStorageClient) {
      try {
        const { data: topLevel } = await supabaseStorageClient.storage
          .from(bucketName)
          .list("documents");
        if (Array.isArray(topLevel)) {
          for (const folder of topLevel) {
            const { data: files } = await supabaseStorageClient.storage
              .from(bucketName)
              .list(`documents/${folder.name}`);
            if (Array.isArray(files) && files.length > 0) {
              const paths = files.map((f) => `documents/${folder.name}/${f.name}`);
              deletedCount += paths.length;
              await supabaseStorageClient.storage.from(bucketName).remove(paths);
            }
          }
        }
      } catch (err) {
        console.error("Failed to purge Supabase storage:", err);
      }
      return deletedCount;
    }
    deletedCount = mockStorage.size;
    mockStorage.clear();
    return deletedCount;
  },
};
