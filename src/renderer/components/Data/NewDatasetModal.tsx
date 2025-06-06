import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  Box,
  CircularProgress,
  Select,
  Option,
} from '@mui/joy';
import { PlusCircleIcon } from 'lucide-react';
import Dropzone from 'react-dropzone';
import { IoCloudUploadOutline } from 'react-icons/io5';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetDetailsModal({ open, setOpen }) {
  const [newDatasetName, setNewDatasetName] = useState('');
  const [datasetType, setDatasetType] = useState('text');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = useState(false);

  const swrKey = open ? chatAPI.Endpoints.Dataset.LocalList(false) : null;
  const { data, isLoading, mutate } = useSWR(swrKey, fetcher);

  const handleClose = () => {
    setOpen(false);
    setShowUploadDialog(false);
    setNewDatasetName('');
    mutate();
  };

  const uploadFiles = async (formData) => {
    setUploading(true);
    const response = await fetch(
      chatAPI.Endpoints.Dataset.Create(newDatasetName),
    );
    const data = await response.json();
    if (data.status === 'error') {
      alert(data.message);
    } else {
      await fetch(chatAPI.Endpoints.Dataset.FileUpload(newDatasetName), {
        method: 'POST',
        body: formData,
      });
    }
    setUploading(false);
    handleClose();
  };

  const validateFiles = (files) => {
    const allowedExtensions = [
      '.json',
      '.jsonl',
      '.csv',
      '.zip',
      '.jpg',
      '.jpeg',
      '.png',
      'tiff',
      'webp',
    ];
    const isValid = (file) =>
      allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    const invalidFiles = files.filter((f) => !isValid(f));
    return invalidFiles;
  };

  const previewSample = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      try {
        const preview = file.name.endsWith('.jsonl')
          ? JSON.parse(content.split('\n')[0])
          : JSON.parse(content);
        console.log('Preview sample:', preview);
      } catch (e) {
        console.error('Invalid JSON preview:', e);
      }
    };
    reader.readAsText(file);
  };

  const maybeAddGeneratedMetadata = (files, formData) => {
    const hasMetadata = files.some((f) =>
      ['.json', '.jsonl', '.csv'].some((ext) =>
        f.name.toLowerCase().endsWith(ext),
      ),
    );

    if (!hasMetadata) {
      const imageFiles = files.filter(
        (f) =>
          f.type.startsWith('image/') ||
          ['.jpg', '.jpeg', '.png', '.webp', '.tiff'].some((ext) =>
            f.name.toLowerCase().endsWith(ext),
          ),
      );

      const folderGroups = {};
      imageFiles.forEach((f) => {
        const relativePath = (f as any).webkitRelativePath || f.name;
        const folder = relativePath.includes('/')
          ? relativePath.substring(0, relativePath.lastIndexOf('/'))
          : '';
        if (!folderGroups[folder]) folderGroups[folder] = [];
        folderGroups[folder].push(f);
      });

      Object.entries(folderGroups).forEach(([folder, filesInFolder]) => {
        const lastFolder = folder.includes('/')
          ? folder.substring(folder.lastIndexOf('/') + 1)
          : folder;
        const labelValue =
          lastFolder.toLowerCase() === 'train' ||
          lastFolder.toLowerCase() === 'test'
            ? 'N/A'
            : lastFolder;

        const jsonl = filesInFolder
          .map((f) => {
            const relativePath = (f as any).webkitRelativePath || f.name;
            const fileName = relativePath.substring(
              relativePath.lastIndexOf('/') + 1,
            );

            // Determine split by analyzing folder structure
            const pathParts = relativePath.split('/').slice(0, -1); // Exclude file name
            let split = 'train'; // Default split
            for (let i = pathParts.length - 1; i >= 0; i--) {
              const part = pathParts[i].toLowerCase();
              if (part === 'train' || part === 'test') {
                split = part;
                break;
              }
            }

            return JSON.stringify({
              file_name: fileName,
              label: labelValue,
              split: split,
            });
          })
          .join('\n');

        const blob = new Blob([jsonl], { type: 'application/jsonl' });
        const metadataFilePath = folder
          ? `${folder}/metadata.jsonl`
          : 'metadata.jsonl';
        const metadataFile = new File([blob], metadataFilePath);
        formData.append('files', metadataFile);
      });
    }
  };

  return (
    <>
      <Modal open={open} onClose={handleClose}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">
            {newDatasetName || 'New'} Dataset
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {newDatasetName === '' && (
              <form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.currentTarget.elements['dataset-name']?.value;
                  if (data.map((item) => item.dataset_id).includes(name)) {
                    alert('Dataset name already exists.');
                    return;
                  }
                  setNewDatasetName(name);
                  setShowUploadDialog(true);
                  setOpen(false);
                }}
              >
                <Input
                  placeholder="Dataset Name"
                  name="dataset-name"
                  required
                />
                <Select
                  value={datasetType}
                  onChange={(e, newVal) => setDatasetType(newVal)}
                  required
                >
                  <Option value="text">Text</Option>
                  <Option value="image">Image</Option>
                </Select>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? <CircularProgress /> : 'Next'}
                </Button>
              </form>
            )}
          </Sheet>
        </ModalDialog>
      </Modal>
      <Modal open={showUploadDialog} onClose={handleClose}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg" sx={{ textTransform: 'capitalize' }}>
            Upload {datasetType} Dataset
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: '25vw',
            }}
          >
            {datasetType === 'image' ? (
              <>
                <Typography level="body-sm" color="neutral">
                  Supported formats: image folder (with supported image types)
                </Typography>
                <Dropzone
                  noClick
                  onDragEnter={() => setDropzoneActive(true)}
                  onDragLeave={() => setDropzoneActive(false)}
                  onDrop={async (acceptedFiles, fileRejections, event) => {
                    setDropzoneActive(false);

                    const fileToPathMap = new Map<File, string>();

                    async function traverseFileTree(
                      item: any,
                      path = '',
                    ): Promise<File[]> {
                      return new Promise((resolve) => {
                        if (item.isFile) {
                          item.file((file: File) => {
                            fileToPathMap.set(file, path + file.name);
                            resolve([file]);
                          });
                        } else if (item.isDirectory) {
                          const dirReader = item.createReader();
                          dirReader.readEntries(async (entries: any[]) => {
                            const filesArrays = await Promise.all(
                              entries.map((entry) =>
                                traverseFileTree(entry, path + item.name + '/'),
                              ),
                            );
                            resolve(filesArrays.flat());
                          });
                        } else {
                          resolve([]);
                        }
                      });
                    }

                    const items = event.dataTransfer?.items;
                    const allFiles: File[] = [];
                    let hasFolder = false;

                    if (items) {
                      for (const item of items) {
                        const entry = item.webkitGetAsEntry?.();
                        if (entry) {
                          if (entry.isDirectory) {
                            hasFolder = true;
                          }
                          const files = await traverseFileTree(entry);
                          allFiles.push(...files);
                        }
                      }
                    }

                    if (!hasFolder) {
                      alert(
                        'Please drag and drop a folder, not individual files.',
                      );
                      return;
                    }

                    const validFiles = allFiles.filter(
                      (file) => validateFiles([file]).length === 0,
                    );

                    if (validFiles.length === 0) {
                      alert('No supported files found in the selected folder.');
                      return;
                    }

                    const formData = new FormData();
                    for (const file of validFiles) {
                      const relPath = fileToPathMap.get(file) || file.name;
                      formData.append('files', file, relPath);
                    }

                    maybeAddGeneratedMetadata(validFiles, formData);
                    await uploadFiles(formData);
                  }}
                  getFilesFromEvent={() => Promise.resolve([])}
                >
                  {({ getRootProps, getInputProps }) => (
                    <div {...getRootProps()}>
                      <Sheet
                        color="primary"
                        variant="soft"
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '130px',
                          border: dropzoneActive
                            ? '2px solid orange'
                            : '2px dashed grey',
                          borderRadius: '8px',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <IoCloudUploadOutline size="36px" />
                        <Typography level="body-md" mt={1}>
                          Drag & drop image folders here
                        </Typography>
                        <Typography level="body-xs" mt={1}>
                          Or use the button below
                        </Typography>
                      </Sheet>
                    </div>
                  )}
                </Dropzone>

                <Button
                  startDecorator={<PlusCircleIcon />}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.setAttribute('webkitdirectory', '');
                    input.onchange = async (e) => {
                      const files = Array.from(input.files);
                      const rootFiles = files.filter((file) => {
                        const relativePath =
                          (file as any).webkitRelativePath || '';
                        return (
                          !relativePath.includes('/') &&
                          validateFiles([file]).length === 0
                        );
                      });
                      const validFiles = files.filter(
                        (file) => validateFiles([file]).length === 0,
                      );
                      if (validFiles.length === 0 && rootFiles.length === 0) {
                        alert(
                          'No supported files found in the selected folder.',
                        );
                        return;
                      }
                      const formData = new FormData();
                      rootFiles.forEach((file) => {
                        formData.append('files', file, file.name);
                      });
                      validFiles.forEach((file) => {
                        const relativePath =
                          (file as any).webkitRelativePath || file.name;
                        formData.append('files', file, relativePath);
                      });
                      maybeAddGeneratedMetadata(validFiles, formData);
                      await uploadFiles(formData);
                    };
                    input.click();
                  }}
                  disabled={uploading}
                >
                  {uploading ? <CircularProgress /> : 'Browse Image Folder'}
                </Button>
              </>
            ) : (
              <>
                <Typography level="body-sm" color="neutral">
                  Supported formats: JSON (.json) or JSONL (.jsonl)
                </Typography>
                <Dropzone
                  onDrop={async (acceptedFiles) => {
                    setDropzoneActive(false);
                    const invalidFiles = validateFiles(acceptedFiles);
                    if (invalidFiles.length > 0) {
                      alert(
                        `Unsupported file types: ${invalidFiles.map((f) => f.name).join(', ')}`,
                      );
                      return;
                    }
                    if (
                      acceptedFiles.length > 0 &&
                      ['.json', '.jsonl'].some((ext) =>
                        acceptedFiles[0].name.endsWith(ext),
                      )
                    ) {
                      previewSample(acceptedFiles[0]);
                    }
                    const formData = new FormData();
                    acceptedFiles.forEach((file) =>
                      formData.append('files', file),
                    );
                    maybeAddGeneratedMetadata(acceptedFiles, formData);
                    await uploadFiles(formData);
                  }}
                  onDragEnter={() => setDropzoneActive(true)}
                  onDragLeave={() => setDropzoneActive(false)}
                  noClick
                >
                  {({ getRootProps, getInputProps }) => (
                    <div {...getRootProps()}>
                      <Sheet
                        color="primary"
                        variant="soft"
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '130px',
                          border: dropzoneActive
                            ? '2px solid orange'
                            : '2px dashed grey',
                          borderRadius: '8px',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <IoCloudUploadOutline size="36px" /> Drag & drop files
                        here
                        <Typography level="body-xs" mt={2}>
                          Or use the button below
                        </Typography>
                      </Sheet>
                    </div>
                  )}
                </Dropzone>
                <Button
                  startDecorator={<PlusCircleIcon />}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = async (e) => {
                      const files = Array.from(input.files);
                      const invalidFiles = validateFiles(files);
                      if (invalidFiles.length > 0) {
                        alert(
                          `Unsupported file types: ${invalidFiles.map((f) => f.name).join(', ')}`,
                        );
                        return;
                      }
                      if (
                        files.length > 0 &&
                        ['.json', '.jsonl'].some((ext) =>
                          files[0].name.endsWith(ext),
                        )
                      ) {
                        previewSample(files[0]);
                      }
                      const formData = new FormData();
                      files.forEach((file) => formData.append('files', file));
                      await uploadFiles(formData);
                    };
                    input.click();
                  }}
                  disabled={uploading}
                >
                  {uploading ? <CircularProgress /> : 'Browse files'}
                </Button>
              </>
            )}
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
}
