import {
  Dropdown,
  List,
  ListItem,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Typography,
} from '@mui/joy';
import React, { useState, useEffect } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { FolderIcon } from 'lucide-react';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function PickADocumentMenu({
  experimentInfo,
  showFoldersOnly = false,
}) {
  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR(chatAPI.Endpoints.Documents.List(experimentInfo?.id, ''), fetcher);

  return (
    <Dropdown>
      <MenuButton>Pick {showFoldersOnly ? 'Folder' : 'File'}</MenuButton>
      <Menu>
        {isLoading ? (
          <MenuItem>Loading...</MenuItem>
        ) : (
          rows?.map((row) =>
            showFoldersOnly ? (
              row?.type == 'folder' && (
                <MenuItem key={row.id} onClick={() => console.log(row)}>
                  <Typography sx={{ display: 'flex', alignItems: 'center' }}>
                    {row?.type == 'folder' ? <FolderIcon size="14px" /> : null}
                    &nbsp;
                    {row.name}
                  </Typography>
                </MenuItem>
              )
            ) : (
              <MenuItem key={row.id} onClick={() => console.log(row)}>
                <Typography sx={{ display: 'flex', alignItems: 'center' }}>
                  {row?.type == 'folder' ? <FolderIcon size="14px" /> : null}
                  &nbsp;
                  {row.name}
                </Typography>
              </MenuItem>
            )
          )
        )}
      </Menu>
    </Dropdown>
  );
}
