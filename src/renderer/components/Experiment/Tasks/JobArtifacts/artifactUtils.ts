import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { fetchWithAuth } from 'renderer/lib/authContext';

const PREVIEWABLE_EXTENSIONS = [
  'json',
  'txt',
  'log',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'svg',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'glb',
  'gltf',
];

export function getFileExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || '';
}

export function canPreviewFile(filename: string): boolean {
  return PREVIEWABLE_EXTENSIONS.includes(getFileExtension(filename));
}

export async function downloadArtifact(
  experimentId: string | undefined,
  jobId: string,
  filename: string,
): Promise<void> {
  const downloadUrl = getAPIFullPath('jobs', ['getArtifact'], {
    experimentId,
    jobId,
    filename,
  });
  const response = await fetchWithAuth(`${downloadUrl}?task=download`);
  if (!response.ok) throw new Error('Failed to download artifact');
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
}

export async function downloadAllArtifacts(
  experimentId: string | undefined,
  jobId: string,
): Promise<void> {
  const downloadUrl = getAPIFullPath('jobs', ['downloadAllArtifacts'], {
    experimentId,
    jobId,
  });
  const response = await fetchWithAuth(downloadUrl);
  if (!response.ok) throw new Error('Failed to download artifacts');
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `artifacts_job_${jobId}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
}
