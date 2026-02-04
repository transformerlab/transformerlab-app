import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpenIcon } from 'lucide-react';
import { Box, Typography, List, ListItem, Alert, Button } from '@mui/joy';

const TaskDirectoryUploader = ({ onUpload }) => {
  const [fileList, setFileList] = useState([]);
  const [error, setError] = useState(null);
  const [showCreateBlank, setShowCreateBlank] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const inputRef = useRef(null);

  /**
   * Helper: Recursively parse entries (for Drag-and-Drop)
   * This mimics the browser's native file system behavior
   */
  const getFilesFromEntry = async (entry, path = '') => {
    console.log(
      '[getFilesFromEntry] Processing entry:',
      entry.name,
      'isFile:',
      entry.isFile,
      'isDirectory:',
      entry.isDirectory,
      'path:',
      path,
    );

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          const relativePath = path + file.name;
          console.log(
            '[getFilesFromEntry] File found:',
            file.name,
            'relativePath:',
            relativePath,
          );
          // Manually add the relative path property to the file object
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relativePath,
            writable: true,
          });
          resolve([file]);
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise((resolve) => {
        dirReader.readEntries(async (entries) => {
          console.log(
            '[getFilesFromEntry] Directory entries:',
            entries.length,
            'in',
            entry.name,
          );
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
      console.log('[onDrop] Called with:', {
        acceptedFilesCount: acceptedFiles.length,
        fileRejectionsCount: fileRejections.length,
        eventType: event?.type,
        hasDataTransfer: !!event?.dataTransfer,
      });

      setError(null);
      setShowCreateBlank(false);
      setPendingFiles([]);
      let allFiles = [];

      // DETECT SOURCE: Drag (DataTransfer) vs Click (Input)
      const isDragEvent = event?.dataTransfer && event.dataTransfer.items;
      console.log('[onDrop] isDragEvent:', isDragEvent);

      // Use acceptedFiles directly - react-dropzone already extracts files from both
      // drag events and click events, with webkitRelativePath populated
      console.log('[onDrop] Using acceptedFiles:', acceptedFiles.length);
      acceptedFiles.forEach((f, i) => {
        console.log(
          '[onDrop] File',
          i,
          ':',
          f.name,
          'webkitRelativePath:',
          f.webkitRelativePath,
        );
      });
      allFiles = acceptedFiles;

      console.log('[onDrop] Total allFiles:', allFiles.length);
      allFiles.forEach((f, i) => {
        console.log(
          '[onDrop] allFiles[' + i + ']:',
          f.name,
          'path:',
          f.webkitRelativePath,
        );
      });

      // 3. Validation: Check for task.yaml only
      const hasTaskYaml = allFiles.some((file) => {
        const path = file.webkitRelativePath || file.name;
        const matches = path.endsWith('task.yaml') || file.name === 'task.yaml';
        return matches;
      });

      if (!hasTaskYaml) {
        setError(
          "❌ Invalid Task: The directory must contain a 'task.yaml' file.",
        );
        setShowCreateBlank(true);
        setPendingFiles(allFiles);
        setFileList([]);
        return;
      }

      // Success
      setShowCreateBlank(false);
      setPendingFiles([]);
      setFileList(allFiles);
      if (onUpload) {
        onUpload(allFiles);
      }
    },
    [onUpload],
  );

  // Custom function to get files from drag event with directory structure
  const getFilesFromEvent = async (event) => {
    const files = [];

    if (event.dataTransfer) {
      const items = event.dataTransfer.items;
      console.log('[getFilesFromEvent] Processing', items.length, 'items');

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          const entryFiles = await getFilesFromEntry(entry);
          files.push(...entryFiles);
        }
      }
    } else if (event.target?.files) {
      // Handle file input change event
      files.push(...Array.from(event.target.files));
    }

    console.log('[getFilesFromEvent] Returning', files.length, 'files');
    return files;
  };

  // Configure Dropzone - disable click since we handle it manually for directory selection
  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: true,
    getFilesFromEvent,
  });

  const rootProps = getRootProps();

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      // Simulate the onDrop callback for click-selected files
      onDrop(files, [], e);
    }
  };

  const handleCreateBlank = () => {
    // Create a default task.yaml file
    const defaultYaml =
      'name: my-task\nresources:\n  cpus: 2\n  memory: 4\nrun: "echo hello"';
    const blob = new Blob([defaultYaml], { type: 'text/yaml' });
    const taskYamlFile = new File([blob], 'task.yaml', { type: 'text/yaml' });

    // Set webkitRelativePath to the root of the directory
    // Try to infer the root directory from existing files
    let rootPath = '';
    if (pendingFiles.length > 0) {
      const firstFile = pendingFiles[0];
      const path = firstFile.webkitRelativePath || firstFile.name;
      const pathParts = path.split('/');
      if (pathParts.length > 1) {
        rootPath = pathParts[0] + '/';
      }
    }

    Object.defineProperty(taskYamlFile, 'webkitRelativePath', {
      value: rootPath + 'task.yaml',
      writable: true,
    });

    // Add the task.yaml file to the file list
    const filesWithTaskYaml = [...pendingFiles, taskYamlFile];
    setShowCreateBlank(false);
    setPendingFiles([]);
    setError(null);
    setFileList(filesWithTaskYaml);
    if (onUpload) {
      onUpload(filesWithTaskYaml);
    }
  };

  return (
    <Box sx={{ mx: 'auto' }}>
      <Box
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
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
          bgcolor: isDragActive ? 'danger.softHoverBg' : 'danger.softBg',
          '&:hover': {
            borderColor: 'primary.400',
          },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
          webkitdirectory="true"
          directory=""
        />

        <Box sx={{ mb: 1, pointerEvents: 'none' }}>
          <FolderOpenIcon size="60px" strokeWidth={1} />
        </Box>
        <Typography level="title-lg" sx={{ mb: 1, pointerEvents: 'none' }}>
          Upload Task Directory
        </Typography>

        {isDragActive ? (
          <Typography
            level="body-md"
            color="neutral"
            sx={{ pointerEvents: 'none' }}
          >
            Drop the folder here...
          </Typography>
        ) : (
          <Typography
            level="body-md"
            color="neutral"
            sx={{ pointerEvents: 'none' }}
          >
            Drag and drop your task folder here, or{' '}
            <Typography
              component="span"
              color="primary"
              sx={{
                textDecoration: 'underline',
                fontWeight: 'bold',
                pointerEvents: 'none',
              }}
            >
              click to browse
            </Typography>
          </Typography>
        )}

        <Typography
          level="body-sm"
          color="neutral"
          sx={{ mt: 1, pointerEvents: 'none' }}
        >
          Must contain task.yaml
        </Typography>
      </Box>

      {error && (
        <Box sx={{ mt: 2 }}>
          <Alert color="danger" sx={{ mb: showCreateBlank ? 2 : 0 }}>
            {error}
          </Alert>
          {showCreateBlank && (
            <Box
              sx={{
                padding: 2,
                backgroundColor: 'var(--joy-palette-neutral-50)',
                borderRadius: 'md',
                border: '1px solid',
                borderColor: 'neutral.200',
              }}
            >
              <Typography
                level="body-sm"
                sx={{ mb: 1.5, color: 'neutral.700' }}
              >
                task.yaml not found in the directory. Create a blank task.yaml
                with a sample template?
              </Typography>
              <Button
                color="primary"
                variant="solid"
                size="sm"
                onClick={handleCreateBlank}
              >
                Create Blank
              </Button>
            </Box>
          )}
        </Box>
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
