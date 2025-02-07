import React, { useState } from 'react';
import { Box, Typography } from '@mui/joy';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { FolderIcon, Check } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface FolderChildrenProps {
  experimentId: string;
  folderId: string;
  toggleSelect: (id: string, filePath: string, fileName: string) => void;
  selectedIds: Set<string>;
}

function FolderChildren({ experimentId, folderId, toggleSelect, selectedIds }: FolderChildrenProps) {
  const { data, isLoading } = useSWR(
    chatAPI.Endpoints.Documents.List(experimentId, folderId),
    fetcher
  );

  if (isLoading) {
    return <Typography sx={{ ml: 4 }}>Loading...</Typography>;
  }
  if (!data || data.length === 0) {
    return <Typography sx={{ ml: 4 }}>No documents</Typography>;
  }
  return (
    <Box sx={{ ml: 4 }}>
      {data.map((child: any, idx: number) => {
        const childId = child.id ? child.id.toString() : `child-index-${idx}`;
        const isFolder = child?.type === 'folder';
        return (
          <Box
            key={childId}
            onClick={!isFolder ? () => toggleSelect(childId, child?.path || '', child?.name || 'Unknown') : undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              p: 1,
              my: 0.5,
              borderRadius: 'sm',
              cursor: !isFolder ? 'pointer' : 'default',
              backgroundColor: !isFolder && selectedIds.has(childId)
                ? 'primary.softHoverBg'
                : 'transparent',
              '&:hover': !isFolder ? { backgroundColor: 'primary.softHoverBg' } : undefined,
            }}
          >
            {isFolder && <FolderIcon size="14px" />}
            <Typography ml={isFolder ? 1 : 0}>
              {child?.name || 'Unnamed'}
            </Typography>
            {!isFolder && selectedIds.has(childId) && (
              <Check size="16px" style={{ marginLeft: 'auto', color: 'green' }} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

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

  // State for expanded folders (by unique id)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // State for selected non-folder items (by unique id)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleSelect = (id: string, filePath: string, fileName: string) => {
    const isSelected = selectedIds.has(id);
    const newSelected = new Set(selectedIds);
    if (isSelected) {
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
                onClick={() => {
                  if (isFolder) {
                    toggleExpand(uniqueId);
                  } else {
                    // We use row.path for file identifier; adjust if necessary.
                    toggleSelect(uniqueId, row?.path || '', row?.name || '');
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 1,
                  my: 0.5,
                  borderRadius: 'sm',
                  cursor: 'pointer',
                  backgroundColor: isFolder
                    ? expandedFolders.has(uniqueId)
                      ? 'primary.softHoverBg'
                      : 'transparent'
                    : selectedIds.has(uniqueId)
                    ? 'primary.softHoverBg'
                    : 'transparent',
                  '&:hover': { backgroundColor: 'primary.softHoverBg' },
                }}
              >
                {isFolder && <FolderIcon size="14px" />}
                <Typography ml={isFolder ? 1 : 0}>
                  {row?.name || 'Unnamed'}
                </Typography>
                {!isFolder && selectedIds.has(uniqueId) && (
                  <Check size="16px" style={{ marginLeft: 'auto', color: 'green' }} />
                )}
              </Box>
              {isFolder && expandedFolders.has(uniqueId) && (
                <FolderChildren experimentId={experimentInfo?.id} folderId={uniqueId} toggleSelect={toggleSelect} selectedIds={selectedIds} />
              )}
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
