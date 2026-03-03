import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  List,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  CircularProgress,
  Sheet,
  Breadcrumbs,
  Link,
} from '@mui/joy';
import { FolderIcon, FileIcon, ChevronRightIcon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import { formatBytes } from 'renderer/lib/utils';

interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

interface FileBrowserModalProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
}

export default function FileBrowserModal({
  open,
  onClose,
  jobId,
}: FileBrowserModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileMediaType, setFileMediaType] = useState<string>('');

  const fetchFiles = useCallback(
    async (subpath: string) => {
      if (!experimentInfo?.id || jobId === -1) return;
      setLoading(true);
      try {
        const url = getAPIFullPath('jobs', ['listFiles'], {
          experimentId: experimentInfo.id,
          jobId,
          subpath: encodeURIComponent(subpath),
        });
        const res = await fetchWithAuth(url);
        const data = await res.json();
        setFiles(data.files || []);
      } catch (e) {
        console.error('Failed to fetch job files', e);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [experimentInfo?.id, jobId],
  );

  useEffect(() => {
    if (open && jobId !== -1) {
      setCurrentPath('');
      setSelectedFile(null);
      setFileContent(null);
      setFileMediaType('');
      fetchFiles('');
    }
  }, [open, jobId, fetchFiles]);

  const handleNavigate = (subpath: string) => {
    setCurrentPath(subpath);
    setSelectedFile(null);
    setFileContent(null);
    setFileMediaType('');
    fetchFiles(subpath);
  };

  const handleFileClick = async (file: FileEntry) => {
    if (file.is_dir) {
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      handleNavigate(newPath);
      return;
    }

    const filePath = currentPath
      ? `${currentPath}/${file.name}`
      : file.name;
    setSelectedFile(filePath);
    setFileLoading(true);
    setFileContent(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const textExtensions = [
      'txt', 'log', 'csv', 'py', 'yaml', 'yml', 'md', 'sh', 'cfg', 'ini',
      'toml', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx',
      'sql', 'r', 'ipynb',
    ];
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

    try {
      const url = getAPIFullPath('jobs', ['getFile'], {
        experimentId: experimentInfo?.id,
        jobId,
        filePath: encodeURIComponent(filePath),
      });

      if (imageExtensions.includes(ext)) {
        setFileMediaType('image');
        setFileContent(url);
      } else if (textExtensions.includes(ext)) {
        setFileMediaType('text');
        const res = await fetchWithAuth(url);
        const text = await res.text();
        setFileContent(text);
      } else {
        setFileMediaType('binary');
        setFileContent(null);
      }
    } catch (e) {
      console.error('Failed to fetch file content', e);
      setFileContent('Error loading file');
      setFileMediaType('text');
    } finally {
      setFileLoading(false);
    }
  };

  const pathParts = currentPath ? currentPath.split('/') : [];

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: '90vw', maxWidth: 1100, height: '80vh' }}>
        <ModalClose />
        <Typography level="h4" component="h2">
          File Browser — Job {jobId}
        </Typography>

        <Breadcrumbs sx={{ px: 0, py: 0.5 }}>
          <Link
            component="button"
            color={currentPath ? 'primary' : 'neutral'}
            onClick={() => handleNavigate('')}
            underline="hover"
          >
            root
          </Link>
          {pathParts.map((part: string, index: number) => {
            const partPath = pathParts.slice(0, index + 1).join('/');
            const isLast = index === pathParts.length - 1;
            return (
              <Link
                key={partPath}
                component="button"
                color={isLast ? 'neutral' : 'primary'}
                onClick={() => handleNavigate(partPath)}
                underline="hover"
              >
                {part}
              </Link>
            );
          })}
        </Breadcrumbs>

        <Box sx={{ display: 'flex', flex: 1, gap: 1, overflow: 'hidden' }}>
          {/* File list panel */}
          <Sheet
            variant="outlined"
            sx={{
              width: 320,
              minWidth: 260,
              overflow: 'auto',
              borderRadius: 'sm',
            }}
          >
            {loading ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <CircularProgress size="sm" />
              </Box>
            ) : files.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography level="body-sm" color="neutral">
                  No files found
                </Typography>
              </Box>
            ) : (
              <List size="sm">
                {files.map((file) => {
                  const filePath = currentPath
                    ? `${currentPath}/${file.name}`
                    : file.name;
                  const isSelected = selectedFile === filePath;
                  return (
                    <ListItemButton
                      key={file.name}
                      selected={isSelected}
                      onClick={() => handleFileClick(file)}
                    >
                      <ListItemDecorator>
                        {file.is_dir ? (
                          <FolderIcon size={16} />
                        ) : (
                          <FileIcon size={16} />
                        )}
                      </ListItemDecorator>
                      <ListItemContent>
                        <Typography level="body-sm" noWrap>
                          {file.name}
                        </Typography>
                      </ListItemContent>
                      {file.is_dir ? (
                        <ChevronRightIcon size={14} />
                      ) : (
                        <Typography level="body-xs" color="neutral">
                          {formatBytes(file.size)}
                        </Typography>
                      )}
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Sheet>

          {/* Preview panel */}
          <Sheet
            variant="outlined"
            sx={{
              flex: 1,
              overflow: 'auto',
              borderRadius: 'sm',
              p: 2,
            }}
          >
            {!selectedFile ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Typography level="body-sm" color="neutral">
                  Select a file to preview
                </Typography>
              </Box>
            ) : fileLoading ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <CircularProgress size="sm" />
              </Box>
            ) : fileMediaType === 'image' && fileContent ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <img
                  src={fileContent}
                  alt={selectedFile}
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              </Box>
            ) : fileMediaType === 'text' && fileContent !== null ? (
              <Box
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  m: 0,
                }}
              >
                {fileContent}
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Typography level="body-sm" color="neutral">
                  Binary file — preview not available
                </Typography>
              </Box>
            )}
          </Sheet>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
