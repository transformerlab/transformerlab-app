/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import { ColorPaletteProp } from '@mui/joy/styles';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormLabel,
  Link,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  Select,
  Option,
  Table,
  Sheet,
  IconButton,
  Typography,
  Menu,
  MenuButton,
  MenuItem,
  Dropdown,
  CircularProgress,
  ListItemDecorator,
  Stack,
} from '@mui/joy';

import {
  ChevronUpIcon,
  EyeIcon,
  FileTextIcon,
  FileUpIcon,
  FolderIcon,
  PlusCircleIcon,
  RotateCcwIcon,
  SearchIcon,
} from 'lucide-react';
import {
  FilterIcon as FilterAltIcon,
  ChevronDownIcon,
  MoreVerticalIcon as MoreHorizRoundedIcon,
} from 'lucide-react';
import useSWR from 'swr';

import { formatBytes } from 'renderer/lib/utils';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import Dropzone from 'react-dropzone';
import { FaRegFileAlt } from 'react-icons/fa';
import { FaRegFilePdf } from 'react-icons/fa6';
import { LuFileJson } from 'react-icons/lu';
import TinyButton from 'renderer/components/Shared/TinyButton';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

type Doc = 'asc' | 'desc';

function getComparator<Key extends keyof any>(
  order: Doc,
  orderBy: Key,
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string },
) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

// Since 2020 all major browsers ensure sort stability with Array.prototype.sort().
// stableSort() brings sort stability to non-modern browsers (notably IE11). If you
// only support modern browsers you can replace stableSort(exampleArray, exampleComparator)
// with exampleArray.slice().sort(exampleComparator)
function stableSort<T>(
  array: readonly T[],
  comparator: (a: T, b: T) => number,
) {
  if (!Array.isArray(array)) return [];
  const stabilizedThis = array?.map((el, index) => [el, index] as [T, number]);
  stabilizedThis?.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilizedThis?.map((el) => el[0]);
}

function RowMenu({ experimentInfo, filename, foldername, mutate, row }) {
  return (
    <Dropdown>
      <MenuButton
        slots={{ root: IconButton }}
        slotProps={{ root: { variant: 'plain', color: 'neutral', size: 'sm' } }}
      >
        <MoreHorizRoundedIcon size="16px" />
      </MenuButton>
      <Menu size="sm" sx={{ minWidth: 140 }}>
        <MenuItem disabled>Size: {formatBytes(row?.size)}</MenuItem>
        {/* <MenuItem disabled>Rename</MenuItem> */}
        <Divider />
        <MenuItem
          color="danger"
          onClick={() => {
            fetch(
              chatAPI.Endpoints.Documents.Delete(experimentInfo?.id, filename, foldername),
            ).then((response) => {
              if (response.ok) {
                console.log(response);
                mutate();
              } else {
                console.log('Error deleting file');
              }
            });
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Dropdown>
  );
}

const fetcher = (url) => fetch(url).then((res) => res.json());
type Order = 'asc' | 'desc';

export default function Documents({
  experimentInfo,
  fullPage = false,
  additionalMessage = false,
  fixedFolder = '',
}) {
  const [doc, setDoc] = React.useState<Doc>('desc');
  const [open, setOpen] = React.useState(false);
  const [dropzoneActive, setDropzoneActive] = React.useState(false);
  const [previewFile, setPreviewFile] = React.useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [currentFolder, setCurrentFolder] = React.useState(fixedFolder);
  const [order, setOrder] = React.useState<Order>('asc');

  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR(
    chatAPI.Endpoints.Documents.List(experimentInfo?.id, currentFolder),
    fetcher,
  );

  const uploadFiles = async (currentFolder, formData) => {
    fetch(
      chatAPI.Endpoints.Documents.Upload(experimentInfo?.id, currentFolder),
      {
        method: 'POST',
        body: formData,
      },
    )
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('File upload failed');
        }
      })
      .then((data) => {
        console.log('Server response:', data);
        setLoading(false);
        mutate();
      })
      .catch((error) => {
        console.error('Error uploading file:', error);
      });
  };

  const createFolder = async (name: string) => {
    try {
      const response = await fetch(
        chatAPI.Endpoints.Documents.CreateFolder(experimentInfo?.id, name),
        {
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw new Error('Folder creation failed');
      }
      const data = await response.json();
      console.log('Server response:', data);
      setLoading(false);
      mutate();
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  function File({ row }) {
    return (
      <tr key={row?.name}>
        <td style={{ paddingLeft: '1rem' }}>
          <Typography
            level="body-sm"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <FileTextIcon size="16px" style={{ marginRight: '0.5rem' }} />
            {row?.name}
          </Typography>
        </td>
        {fullPage && (
          <>
            <td>
              <Typography level="body-xs">{row?.date}</Typography>
            </td>
            <td>
              <Chip
                variant="soft"
                size="sm"
                startDecorator={
                  {
                    '.txt': <FaRegFileAlt />,
                    '.pdf': <FaRegFilePdf />,
                    '.jsonl': <LuFileJson />,
                  }[row?.type]
                }
                color={
                  {
                    '.txt': 'success',
                    '.pdf': 'neutral',
                    '.jsonl': 'danger',
                  }[row?.type] as ColorPaletteProp
                }
              >
                {row?.type}
              </Chip>
            </td>
            <td>
              {row?.size && (
                <Typography level="body-xs" color="neutral">
                  {formatBytes(row?.size)}
                </Typography>
              )}
            </td>
          </>
        )}

        <td>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="plain"
              size="sm"
              style={{ fontSize: '11px' }}
              onClick={() => {
                setPreviewFile(row?.name);
              }}
            >
              <EyeIcon size="16px" />
            </Button>
            <RowMenu
              experimentInfo={experimentInfo}
              filename={row?.name}
              foldername={currentFolder}
              mutate={mutate}
              row={row}
            />
          </Box>
        </td>
      </tr>
    );
  }

  function Folder({ row }) {
    return (
      <tr key={row?.name} onDoubleClick={() => setCurrentFolder(row?.name)}>
        <td style={{ paddingLeft: '1rem' }}>
          <Typography
            level="body-sm"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <FolderIcon size="16px" style={{ marginRight: '0.5rem' }} />
            {row?.name}
          </Typography>
        </td>
        {fullPage && (
          <>
            <td>
              <Typography level="body-xs">{row?.date}</Typography>
            </td>
            <td>
              <Chip
                variant="soft"
                size="sm"
                startDecorator={
                  {
                    '.txt': <FaRegFileAlt />,
                    '.pdf': <FaRegFilePdf />,
                    '.jsonl': <LuFileJson />,
                  }[row?.type]
                }
                color={
                  {
                    '.txt': 'success',
                    '.pdf': 'neutral',
                    '.jsonl': 'danger',
                  }[row?.type] as ColorPaletteProp
                }
              >
                {row?.type}
              </Chip>
            </td>
            <td>
              {row?.size == 0 ? (
                <></>
              ) : (
                row?.size &&
                row?.size != 0 && (
                  <Typography level="body-xs" color="neutral">
                    {formatBytes(row?.size)}
                  </Typography>
                )
              )}
            </td>
          </>
        )}
        <td>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <RowMenu
              experimentInfo={experimentInfo}
              filename={row?.name}
              foldername={currentFolder}
              mutate={mutate}
              row={row}
            />
          </Box>
        </td>
      </tr>
    );
  }

  const renderFilters = () => (
    <React.Fragment>
      <FormControl size="sm">
        <FormLabel>Type</FormLabel>
        <Select
          size="sm"
          placeholder="Filter by type"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
        >
          <Option value="All">All</Option>
          <Option value="Text">Text</Option>
          <Option value="PDF">PDF</Option>
          <Option value="JSONL">JSONL</Option>
        </Select>
      </FormControl>
    </React.Fragment>
  );

  /****
   * Main Documents Component is Here
   */
  return (
    <>
      <Modal
        open={previewFile != null}
        onClose={() => {
          setPreviewFile(null);
        }}
      >
        <ModalDialog sx={{ width: '60vw', height: '80vh' }}>
          <ModalClose />
          <Typography level="title-lg">Document: {previewFile}</Typography>

          <iframe
            src={chatAPI.Endpoints.Documents.Open(
              experimentInfo?.id,
              previewFile,
              currentFolder,
            )}
            style={{ width: '100%', height: '100%' }}
          ></iframe>
        </ModalDialog>
      </Modal>
      <Modal open={showFolderModal} onClose={() => setShowFolderModal(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">Create Folder</Typography>
          <Input
            size="sm"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              color="primary"
              onClick={() => {
                setLoading(true);
                createFolder(newFolderName);
                setLoading(false);
                setShowFolderModal(false);
              }}
            >
              Create
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
      <Box
        sx={{
          display: 'flex',
          mb: 0,
          gap: 1,
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'start', sm: 'center' },
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {loading && <CircularProgress size="sm" />}
          {currentFolder == '' ? (
            'Documents'
          ) : (
            <>
              <Link
                disabled={fixedFolder !== ''}
                onClick={() => {
                  setCurrentFolder('');
                }}
              >
                Documents /
              </Link>{' '}
              {currentFolder} /
            </>
          )}
        </div>
        <Dropdown>
          <MenuButton variant="plain" size="sm">
            <PlusCircleIcon style={{ strokeWidth: '1.5px' }} />
          </MenuButton>
          <Menu>
            <MenuItem
              onClick={() => {
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.onchange = async (e) => {
                  let files = Array.from(input.files);
                  console.log(files);
                  const formData = new FormData();
                  for (const file of files) {
                    formData.append('files', file);
                  }
                  setLoading(true);
                  await uploadFiles(currentFolder, formData);
                };
                input.click();
              }}
            >
              <ListItemDecorator>
                <FileUpIcon size="16px" />
              </ListItemDecorator>
              Upload File
            </MenuItem>
            <MenuItem
              onClick={() => {
                setNewFolderName('');
                setShowFolderModal(true);
              }}
              disabled={currentFolder !== ''}
            >
              <ListItemDecorator>
                <FolderIcon size="16px" />
              </ListItemDecorator>
              Folder
            </MenuItem>
          </Menu>
        </Dropdown>
      </Box>
      <Sheet
        className="SearchAndFilters-mobile"
        sx={{
          display: { xs: 'flex', sm: 'none' },
          my: 1,
          gap: 1,
        }}
      >
        <Input
          size="sm"
          placeholder="Search"
          startDecorator={<SearchIcon />}
          sx={{ flexGrow: 1 }}
        />
        <IconButton
          size="sm"
          variant="outlined"
          color="neutral"
          onClick={() => setOpen(true)}
        >
          <FilterAltIcon />
        </IconButton>
        <Modal open={open} onClose={() => setOpen(false)}>
          <ModalDialog aria-labelledby="filter-modal" layout="fullscreen">
            <ModalClose />
            <Typography id="filter-modal" level="h2">
              Filters
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {renderFilters()}
              <Button color="primary" onClick={() => setOpen(false)}>
                Submit
              </Button>
            </Sheet>
          </ModalDialog>
        </Modal>
      </Sheet>
      {/* <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          py: 2,
          display: { xs: 'none', sm: 'flex' },
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: { xs: '120px', md: '160px' },
          },
        }}
      >
        {/* <FormControl sx={{ flex: 1 }} size="sm">
          <FormLabel>Search for document</FormLabel>
          <Input
            size="sm"
            placeholder="Search"
            startDecorator={<SearchIcon />}
          />
        </FormControl> }
        { {renderFilters()} }
      </Box> */}
      <Dropzone
        onDrop={async (acceptedFiles) => {
          setDropzoneActive(false);

          const formData = new FormData();
          for (const file of acceptedFiles) {
            formData.append('files', file);
          }
          setLoading(true);
          await uploadFiles(currentFolder, formData);
        }}
        onDragEnter={() => {
          setDropzoneActive(true);
        }}
        onDragLeave={() => {
          setDropzoneActive(false);
        }}
        noClick
      >
        {({ getRootProps, getInputProps }) => (
          <div
            id="dropzone_baby"
            {...getRootProps()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '0rem',
              overflow: 'hidden',
              border: dropzoneActive
                ? '2px solid var(--joy-palette-warning-400)'
                : '2px solid transparent',
              borderRadius: '8px',
              flex: 1,
            }}
          >
            <Sheet
              className="DocTableContainer"
              variant="outlined"
              sx={{
                display: { xs: 'none', sm: 'initial' },
                width: '100%',
                borderRadius: 'sm',
                flexShrink: 1,
                overflow: 'auto',
                minHeight: 0,
                height: '100%',
                paddingBottom: '1rem',
                backgroundColor: dropzoneActive
                  ? 'var(--joy-palette-warning-100)'
                  : '',
              }}
            >
              <Table
                aria-labelledby="tableTitle"
                stickyHeader
                hoverRow
                sx={{
                  '--TableCell-headBackground':
                    'var(--joy-palette-background-level1)',
                  '--TableRow-hoverBackground':
                    'var(--joy-palette-background-level1)',
                }}
              >
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '1rem' }}>
                      <Link
                        underline="none"
                        color="primary"
                        component="button"
                        onClick={() =>
                          setOrder(order === 'asc' ? 'desc' : 'asc')
                        }
                        fontWeight="lg"
                        endDecorator={<ChevronUpIcon />}
                        sx={{
                          '& svg': {
                            transition: '0.2s',
                            transform:
                              order === 'desc'
                                ? 'rotate(0deg)'
                                : 'rotate(180deg)',
                          },
                        }}
                      >
                        File Name
                      </Link>
                    </th>
                    {fullPage && (
                      <>
                        <th style={{ width: '200px' }}>Date</th>
                        <th style={{ width: '120px' }}>Type</th>
                        <th style={{ width: '130px' }}>Size</th>
                      </>
                    )}

                    <th style={{ width: '70px' }}> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.status == 'error' && (
                    <tr>
                      <td colSpan={2}>{/*rows?.message*/}</td>
                    </tr>
                  )}
                  {rows?.length == 0 && (
                    <tr>
                      <td colSpan={2} style={{ padding: '2rem' }}>
                        Drag and drop documents here to query their contents.
                      </td>
                    </tr>
                  )}
                  {stableSort(rows, getComparator(order, 'name'))?.map((row) =>
                    row?.type === 'folder' ? (
                      <Folder row={row} />
                    ) : (
                      <File row={row} />
                    ),
                  )}
                </tbody>
              </Table>
            </Sheet>
          </div>
        )}
      </Dropzone>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Typography level="body-xs" color="neutral">
          Allowed filetypes: .txt, .pdf, .csv, .epub, .ipynb, .mbox, .md, .ppt
        </Typography>
        <TinyButton
          startDecorator={<RotateCcwIcon size="12px" />}
          color="neutral"
          variant="outlined"
          onClick={() => {
            fetch(chatAPI.Endpoints.Rag.ReIndex(experimentInfo?.id));
          }}
        >
          Reindex
        </TinyButton>
      </Stack>
      {additionalMessage && (
        <Typography level="body-xs" mt={1}>
          Documents for RAG should be uploaded in a folder called "rag" and only
          those will be indexed for RAG.
        </Typography>
      )}
    </>
  );
}
