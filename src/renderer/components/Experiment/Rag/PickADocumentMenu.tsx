import React, { useState } from 'react';
import { Box, Typography } from '@mui/joy';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { FolderIcon, Check } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface PickADocumentMenuProps {
  experimentInfo: any;
  showFoldersOnly?: boolean;
  setSelectedFiles: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedFileNames: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function PickADocumentMenu({
  experimentInfo,
  showFoldersOnly = false,
  setSelectedFiles,
  setSelectedFileNames,
}: PickADocumentMenuProps) {
  const { data: rows, isLoading } = useSWR(
    chatAPI.Endpoints.Documents.List(experimentInfo?.id, ''),
    fetcher
  );

  // State for selected items (by unique id)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string, filePath: string, fileName: string) => {
    const newSelected = new Set(selectedIds);
    if (selectedIds.has(id)) {
      newSelected.delete(id);
      setSelectedFiles((prevFiles) => prevFiles.filter((path) => path !== filePath));
      setSelectedFileNames((prevNames) => prevNames.filter((name) => name !== fileName));
    } else {
      newSelected.add(id);
      setSelectedFiles((prevFiles) => [...prevFiles, filePath]);
      setSelectedFileNames((prevNames) => [...prevNames, fileName]);
    }
    setSelectedIds(newSelected);
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'neutral.outlinedBorder', borderRadius: 'sm', p: 1 }}>
      <Typography level="h6" mb={1}>
        Pick {showFoldersOnly ? 'Folder' : 'File'}
      </Typography>
      {isLoading ? (
        <Typography>Loading...</Typography>
      ) : (
        rows?.map((row: any, index: number) => {
          // Use row.id if available; fallback to index.
          const uniqueId = row.name ? row.name.toString() : `index-${index}`;
          const isFolder = row?.type === 'folder';
          return (
            <Box key={uniqueId}>
              <Box
                onClick={() => toggleSelect(uniqueId, row?.path || '', row?.name || '')}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 1,
                  my: 0.5,
                  borderRadius: 'sm',
                  cursor: 'pointer',
                  backgroundColor: selectedIds.has(uniqueId) ? 'primary.softHoverBg' : 'transparent',
                  '&:hover': { backgroundColor: 'primary.softHoverBg' },
                }}
              >
                {isFolder && <FolderIcon size="14px" />}
                <Typography ml={isFolder ? 1 : 0}>
                  {row?.name || 'Unnamed'}
                </Typography>
                {selectedIds.has(uniqueId) && (
                  <Check size="16px" style={{ marginLeft: 'auto', color: 'green' }} />
                )}
              </Box>
            </Box>
          );
        })
      )}
      {!isLoading && (!rows || rows.length === 0) && (
        <Typography>No documents found</Typography>
      )}
    </Box>
  );
}
