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
import { Endpoints, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetchWithAuth } from 'renderer/lib/authContext';
import { formatBytes } from 'renderer/lib/utils';

type FileSource = 'job' | 'github' | 'local';

interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  source?: FileSource;
}

type JobModeProps = {
  mode: 'job';
  jobId: string;
  taskId?: never;
  taskName?: never;
  galleryId?: never;
  galleryTitle?: never;
};

type TaskModeProps = {
  mode: 'task';
  taskId: string;
  taskName?: string | null;
  jobId?: never;
  galleryId?: never;
  galleryTitle?: never;
};

type TeamGalleryModeProps = {
  mode: 'team-gallery';
  galleryId: string;
  galleryTitle?: string | null;
  jobId?: never;
  taskId?: never;
  taskName?: never;
};

type FileBrowserModalProps = {
  open: boolean;
  onClose: () => void;
} & (JobModeProps | TaskModeProps | TeamGalleryModeProps);

type TaskFilesResponse = {
  github_files?: string[] | null;
  local_files?: string[] | null;
};

export default function FileBrowserModal({
  open,
  onClose,
  mode,
  jobId,
  taskId,
  taskName,
  galleryId,
  galleryTitle,
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
      if (!experimentInfo?.id) return;
      setLoading(true);
      try {
        if (mode === 'job') {
          if (!jobId) {
            setFiles([]);
            return;
          }
          const url = getAPIFullPath('jobs', ['listFiles'], {
            experimentId: experimentInfo.id,
            jobId,
            subpath: encodeURIComponent(subpath),
          });
          const res = await fetchWithAuth(url);
          const data = await res.json();
          const nextFiles: FileEntry[] = Array.isArray(data.files)
            ? data.files.map((f: FileEntry) => ({ ...f, source: 'job' }))
            : [];
          setFiles(nextFiles);
        } else if (mode === 'task' && taskId) {
          const url = Endpoints.Task.ListFiles(
            String(experimentInfo.id),
            String(taskId),
          );
          const res = await fetchWithAuth(url);
          const data: TaskFilesResponse = await res.json();
          const nextFiles: FileEntry[] = [];

          if (Array.isArray(data.github_files)) {
            for (const p of data.github_files) {
              nextFiles.push({
                name: p,
                is_dir: false,
                size: 0,
                source: 'github',
              });
            }
          }
          if (Array.isArray(data.local_files)) {
            for (const p of data.local_files) {
              nextFiles.push({
                name: p,
                is_dir: false,
                size: 0,
                source: 'local',
              });
            }
          }

          setFiles(nextFiles);
        } else if (mode === 'team-gallery' && galleryId) {
          const url = Endpoints.Task.TeamGalleryListFiles(
            String(experimentInfo.id),
            String(galleryId),
          );
          const res = await fetchWithAuth(url);
          const data = await res.json();
          const filesList: string[] = Array.isArray(data.files)
            ? data.files
            : [];
          const nextFiles: FileEntry[] = filesList.map((p) => ({
            name: p,
            is_dir: false,
            size: 0,
          }));
          setFiles(nextFiles);
        } else {
          setFiles([]);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch files', e);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [experimentInfo?.id, jobId, mode, taskId, galleryId],
  );

  useEffect(() => {
    if (open) {
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
    if (mode === 'job') {
      if (file.is_dir) {
        const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        handleNavigate(newPath);
        return;
      }

      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      setSelectedFile(filePath);
      setFileLoading(true);
      setFileContent(null);

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const textExtensions = [
        'txt',
        'log',
        'csv',
        'py',
        'yaml',
        'yml',
        'md',
        'sh',
        'cfg',
        'ini',
        'toml',
        'json',
        'xml',
        'html',
        'css',
        'js',
        'ts',
        'tsx',
        'jsx',
        'sql',
        'r',
        'ipynb',
      ];
      const imageExtensions = [
        'png',
        'jpg',
        'jpeg',
        'gif',
        'bmp',
        'webp',
        'svg',
      ];

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
        // eslint-disable-next-line no-console
        console.error('Failed to fetch file content', e);
        setFileContent('Error loading file');
        setFileMediaType('text');
      } finally {
        setFileLoading(false);
      }
      return;
    }

    // Task / Team Gallery mode: treat all entries as files. Task-local entries are fetched
    // from the task workspace directory; GitHub entries are fetched via the GitHub-backed
    // endpoint. Team gallery entries are fetched from the gallery local_task_dir.
    const filePath = file.name;
    setSelectedFile(filePath);
    setFileLoading(true);
    setFileContent(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const textExtensions = [
      'txt',
      'log',
      'csv',
      'py',
      'yaml',
      'yml',
      'md',
      'sh',
      'cfg',
      'ini',
      'toml',
      'json',
      'xml',
      'html',
      'css',
      'js',
      'ts',
      'tsx',
      'jsx',
      'sql',
      'r',
      'ipynb',
    ];
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];

    try {
      const url =
        mode === 'team-gallery'
          ? experimentInfo?.id && galleryId
            ? Endpoints.Task.TeamGalleryGetFile(
                String(experimentInfo.id),
                String(galleryId),
                filePath,
              )
            : null
          : experimentInfo?.id && taskId
            ? file.source === 'github'
              ? Endpoints.Task.GetGithubFile(
                  String(experimentInfo.id),
                  String(taskId),
                  filePath,
                )
              : Endpoints.Task.GetFile(
                  String(experimentInfo.id),
                  String(taskId),
                  filePath,
                )
            : null;

      if (!url) {
        setFileMediaType('text');
        setFileContent('Unable to resolve file preview URL.');
        return;
      }

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
      // eslint-disable-next-line no-console
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
          {mode === 'job'
            ? `File Browser — Job ${jobId}`
            : mode === 'team-gallery'
              ? `Files — Team Gallery ${galleryTitle || galleryId}`
              : `Files — Task ${taskName || taskId}`}
        </Typography>

        {mode === 'job' && (
          <Breadcrumbs sx={{ px: 0, py: 0.5 }}>
            <button
              type="button"
              onClick={() => handleNavigate('')}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              root
            </button>
            {pathParts.map((part: string, index: number) => {
              const partPath = pathParts.slice(0, index + 1).join('/');
              const isLast = index === pathParts.length - 1;
              return (
                <button
                  key={partPath}
                  type="button"
                  onClick={() => handleNavigate(partPath)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: isLast
                      ? 'inherit'
                      : 'var(--joy-palette-primary-500)',
                    font: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  {part}
                </button>
              );
            })}
          </Breadcrumbs>
        )}

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
                        {file.is_dir && mode === 'job' ? (
                          <FolderIcon size={16} />
                        ) : (
                          <FileIcon size={16} />
                        )}
                      </ListItemDecorator>
                      <ListItemContent>
                        <Typography
                          level="body-sm"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                          }}
                        >
                          {mode === 'task' &&
                            !file.is_dir &&
                            file.source &&
                            file.source !== 'job' && (
                              <Box
                                component="span"
                                sx={{
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: '999px',
                                  fontSize: '0.7rem',
                                  textTransform: 'uppercase',
                                  bgcolor:
                                    file.source === 'github'
                                      ? 'primary.solidBg'
                                      : 'neutral.solidBg',
                                  color:
                                    file.source === 'github'
                                      ? 'primary.solidColor'
                                      : 'neutral.solidColor',
                                  flexShrink: 0,
                                }}
                              >
                                {file.source === 'github' ? 'GitHub' : 'Local'}
                              </Box>
                            )}
                          <Box
                            component="span"
                            sx={{
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                          >
                            {file.name}
                          </Box>
                        </Typography>
                      </ListItemContent>
                      {mode === 'job' && file.is_dir && (
                        <ChevronRightIcon size={14} />
                      )}
                      {mode === 'job' && !file.is_dir && (
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
