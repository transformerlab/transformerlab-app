import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpenIcon } from 'lucide-react';
import { Box, Typography, List, ListItem, Alert } from '@mui/joy';

const TaskDirectoryUploader = ({ onUpload }) => {
  const [fileList, setFileList] = useState([]);
  const [error, setError] = useState(null);

  /**
   * Helper: Recursively parse entries (for Drag-and-Drop)
   * This mimics the browser's native file system behavior
   */
  const getFilesFromEntry = async (entry, path = '') => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          // Manually add the relative path property to the file object
          Object.defineProperty(file, 'webkitRelativePath', {
            value: path + file.name,
            writable: true,
          });
          resolve([file]);
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise((resolve) => {
        dirReader.readEntries(async (entries) => {
          const promises = entries.map((e) =>
            getFilesFromEntry(e, `${path}${entry.name}/`),
          );
          const results = await Promise.all(promises);
          resolve(results.flat());
        });
      });
    }
    return [];
  };

  const onDrop = useCallback(
    async (acceptedFiles, fileRejections, event) => {
      setError(null);
      let allFiles = [];

      // DETECT SOURCE: Drag (DataTransfer) vs Click (Input)
      const isDragEvent = event.dataTransfer && event.dataTransfer.items;

      if (isDragEvent) {
        // 1. Handle Drag & Drop (Complex Recursive Parsing)
        const items = event.dataTransfer.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            const entryFiles = await getFilesFromEntry(entry);
            allFiles = [...allFiles, ...entryFiles];
          }
        }
      } else {
        // 2. Handle Click (Standard Input)
        // acceptedFiles already has flat list with webkitRelativePath populated by browser
        allFiles = acceptedFiles;
      }

      // 3. Validation: Check for task.yaml
      const hasTaskYaml = allFiles.some((file) =>
        file.webkitRelativePath.endsWith('task.yaml'),
      );

      if (!hasTaskYaml) {
        setError(
          "❌ Invalid Task: The directory must contain a 'task.yaml' file.",
        );
        setFileList([]);
        return;
      }

      // Success
      setFileList(allFiles);
      if (onUpload) {
        onUpload(allFiles);
      }
    },
    [onUpload],
  );

  // Configure Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Disable click on the container so we can control the input manually
    // (Optional, but often cleaner if you want a specific button to trigger the dialog)
    noClick: false,
    noKeyboard: true,
    multiple: true,
  });

  const rootProps = getRootProps();
  const inputProps = getInputProps();

  return (
    <Box sx={{ mx: 'auto' }}>
      <Box
        onClick={rootProps.onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            rootProps.onClick(e);
          }
        }}
        onDragOver={rootProps.onDragOver}
        onDrop={rootProps.onDrop}
        onDragEnter={rootProps.onDragEnter}
        onDragLeave={rootProps.onDragLeave}
        role="button"
        tabIndex={0}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.500' : 'neutral.400',
          borderRadius: 'md',
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          transition:
            'border-color 0.2s ease-in-out, background-color 0.2s ease-in-out',
          bgcolor: isDragActive ? 'primary.50' : 'background.surface',
          '&:hover': {
            borderColor: 'primary.400',
          },
        }}
      >
        <input
          type={inputProps.type}
          accept={inputProps.accept}
          multiple={inputProps.multiple}
          onChange={inputProps.onChange}
          onClick={inputProps.onClick}
          autoComplete={inputProps.autoComplete}
          tabIndex={inputProps.tabIndex}
          style={inputProps.style}
          webkitdirectory="true"
          directory=""
        />

        <Box sx={{ mb: 1 }}>
          <FolderOpenIcon size="60px" strokeWidth={1} />
        </Box>
        <Typography level="title-lg" sx={{ mb: 1 }}>
          Upload Task Directory
        </Typography>

        {isDragActive ? (
          <Typography level="body-md" color="neutral">
            Drop the folder here...
          </Typography>
        ) : (
          <Typography level="body-md" color="neutral">
            Drag and drop your task folder here, or{' '}
            <Typography
              component="span"
              color="primary"
              sx={{ textDecoration: 'underline', fontWeight: 'bold' }}
            >
              click to browse
            </Typography>
          </Typography>
        )}

        <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>
          Must contain task.yaml
        </Typography>
      </Box>

      {error && (
        <Alert color="danger" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {fileList.length > 0 && (
        <Box
          sx={{
            mt: 2,
            textAlign: 'left',
            border: '1px solid',
            borderColor: 'neutral.200',
            borderRadius: 'sm',
            p: 2,
          }}
        >
          <Typography level="title-sm">
            Ready to Upload ({fileList.length} files):
          </Typography>
          <List size="sm" sx={{ pl: 2 }}>
            {fileList.slice(0, 5).map((file, i) => (
              <ListItem key={i}>{file.webkitRelativePath}</ListItem>
            ))}
            {fileList.length > 5 && (
              <ListItem>...and {fileList.length - 5} more</ListItem>
            )}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default TaskDirectoryUploader;
