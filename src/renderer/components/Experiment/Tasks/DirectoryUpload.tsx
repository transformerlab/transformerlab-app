import React, { useRef, useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Sheet,
  Stack,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/joy';
import { UploadIcon, FileIcon, XIcon } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface DirectoryUploadProps {
  onUploadComplete?: (uploadedDirPath: string) => void;
  onUploadError?: (error: string) => void;
  disabled?: boolean;
}

interface UploadedFile {
  name: string;
  path: string;
  size: number;
}

export default function DirectoryUpload({
  onUploadComplete = () => {},
  onUploadError = () => {},
  disabled = false,
}: DirectoryUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadedDirPath, setUploadedDirPath] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { files } = event.target;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();

      // Add all files to formData
      Array.from(files).forEach((file) => {
        formData.append('dir_files', file);
      });

      // Add directory name (use the first file's directory path or a default name)
      const firstFile = files[0];
      const webkitRelativePath = firstFile.webkitRelativePath || '';
      const dirName = webkitRelativePath.split('/')[0] || 'uploaded_directory';
      formData.append('dir_name', dirName);

      // Make the upload request using authenticated fetch
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Jobs.UploadRemote(),
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Upload failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = await response.json();

      if (result.status === 'success') {
        const uploadedDirPathResult =
          result.data.uploaded_files.dir_files.uploaded_dir;
        setUploadedDirPath(uploadedDirPathResult);

        // Update uploaded files list
        const filesList: UploadedFile[] = Array.from(files).map((file) => ({
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
        }));
        setUploadedFiles(filesList);

        onUploadComplete(uploadedDirPathResult);
      } else {
        const errorMessage = result.message || 'Upload failed';
        setUploadError(errorMessage);
        onUploadError(errorMessage);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      onUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDirectorySelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveUpload = () => {
    setUploadedFiles([]);
    setUploadedDirPath('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <FormControl>
      <FormLabel>Directory Upload (Optional)</FormLabel>
      <input
        ref={fileInputRef}
        type="file"
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...({ webkitdirectory: '' } as any)}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
      />

      {uploadedFiles.length === 0 ? (
        <Sheet
          variant="soft"
          sx={{
            p: 2,
            borderRadius: 'md',
            border: '2px dashed',
            borderColor: 'neutral.300',
            textAlign: 'center',
            cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
            opacity: disabled || isUploading ? 0.6 : 1,
          }}
          onClick={handleDirectorySelect}
        >
          <Stack spacing={1} alignItems="center">
            {isUploading ? (
              <>
                <CircularProgress size="sm" />
                <Typography level="body-sm">Uploading...</Typography>
              </>
            ) : (
              <>
                <UploadIcon size={24} />
                <Typography level="body-sm">
                  Click to select a directory to upload
                </Typography>
                <Typography level="body-xs" color="neutral">
                  All files in the directory will be uploaded
                </Typography>
              </>
            )}
          </Stack>
        </Sheet>
      ) : (
        <Sheet variant="soft" sx={{ p: 2, borderRadius: 'md' }}>
          <Stack spacing={1}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography level="title-sm">Uploaded Directory</Typography>
              {!disabled && (
                <Button
                  size="sm"
                  variant="plain"
                  color="danger"
                  onClick={handleRemoveUpload}
                  startDecorator={<XIcon size={16} />}
                >
                  Remove
                </Button>
              )}
            </Stack>

            <Stack spacing={0.5}>
              <Typography level="body-xs" color="neutral">
                Files ({uploadedFiles.length}):
              </Typography>
              <Sheet
                variant="outlined"
                sx={{
                  p: 1,
                  maxHeight: '150px',
                  overflow: 'auto',
                  borderRadius: 'sm',
                }}
              >
                {uploadedFiles.slice(0, 10).map((file) => (
                  <Stack
                    key={file.path}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ py: 0.5 }}
                  >
                    <FileIcon size={14} />
                    <Typography level="body-xs" sx={{ flex: 1 }}>
                      {file.path}
                    </Typography>
                    <Typography level="body-xs" color="neutral">
                      {formatFileSize(file.size)}
                    </Typography>
                  </Stack>
                ))}
                {uploadedFiles.length > 10 && (
                  <Typography
                    level="body-xs"
                    color="neutral"
                    sx={{ textAlign: 'center', py: 1 }}
                  >
                    ... and {uploadedFiles.length - 10} more files
                  </Typography>
                )}
              </Sheet>
            </Stack>
          </Stack>
        </Sheet>
      )}
      {uploadError && (
        <Alert color="danger" sx={{ mt: 1 }}>
          {uploadError}
        </Alert>
      )}
    </FormControl>
  );
}
