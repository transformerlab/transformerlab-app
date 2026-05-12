import * as chatAPI from './transformerlab-api-sdk';

const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB

export interface ChunkedUploadOptions {
  file: Blob;
  filename: string;
  onProgress?: (percent: number) => void;
}

export interface ChunkedUploadResult {
  upload_id: string;
  temp_path: string;
}

/**
 * Upload a file in 64MB chunks via the /upload API.
 * Returns the upload_id to pass to the consuming endpoint as ?upload_id=.
 * Throws on any failure.
 */
export async function chunkedUpload({
  file,
  filename,
  onProgress,
}: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
  const totalSize = file.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  // 1. Init
  const initResp = await chatAPI.authenticatedFetch(
    chatAPI.Endpoints.Upload.Init(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, total_size: totalSize }),
    },
  );
  if (!initResp.ok) throw new Error(`Upload init failed: ${initResp.status}`);
  const { upload_id } = await initResp.json();

  // 2. Check for already-received chunks (resumability)
  const statusResp = await chatAPI.authenticatedFetch(
    chatAPI.Endpoints.Upload.Status(upload_id),
  );
  const statusBody = statusResp.ok ? await statusResp.json() : { received: [] };
  const alreadyReceived: Set<number> = new Set(statusBody.received ?? []);

  // 3. Send chunks
  for (let i = 0; i < totalChunks; i++) {
    if (alreadyReceived.has(i)) {
      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
      continue;
    }
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = file.slice(start, end);
    const url = chatAPI.Endpoints.Upload.Chunk(upload_id) + `?chunk_index=${i}`;
    const chunkResp = await chatAPI.authenticatedFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk,
    });
    if (!chunkResp.ok)
      throw new Error(`Chunk ${i} upload failed: ${chunkResp.status}`);
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  // 4. Complete
  const completeResp = await chatAPI.authenticatedFetch(
    chatAPI.Endpoints.Upload.Complete(upload_id),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_chunks: totalChunks }),
    },
  );
  if (!completeResp.ok)
    throw new Error(`Upload complete failed: ${completeResp.status}`);
  const { temp_path } = await completeResp.json();

  return { upload_id, temp_path };
}

export async function deleteUpload(upload_id: string): Promise<void> {
  await chatAPI.authenticatedFetch(chatAPI.Endpoints.Upload.Delete(upload_id), {
    method: 'DELETE',
  });
}
