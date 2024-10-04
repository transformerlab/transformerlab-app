/* eslint-disable jsx-a11y/anchor-is-valid */
import * as React from 'react';
import { ColorPaletteProp } from '@mui/joy/styles';
import Avatar from '@mui/joy/Avatar';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import Divider from '@mui/joy/Divider';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Link from '@mui/joy/Link';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import ModalClose from '@mui/joy/ModalClose';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import Table from '@mui/joy/Table';
import Sheet from '@mui/joy/Sheet';
import Checkbox from '@mui/joy/Checkbox';
import IconButton, { iconButtonClasses } from '@mui/joy/IconButton';
import Typography from '@mui/joy/Typography';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import MenuItem from '@mui/joy/MenuItem';
import Dropdown from '@mui/joy/Dropdown';

import {
  FileTextIcon,
  PlusCircleIcon,
  RotateCcwIcon,
  SearchIcon,
} from 'lucide-react';
import {
  FilterIcon as FilterAltIcon,
  ChevronDownIcon as ArrowDropDownIcon,
  BlocksIcon as BlockIcon,
  RefreshCcw as AutorenewRoundedIcon,
  MoreVerticalIcon as MoreHorizRoundedIcon,
} from 'lucide-react';
import useSWR from 'swr';

import { formatBytes } from 'renderer/lib/utils';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import Dropzone from 'react-dropzone';
import { FaRegFileAlt } from 'react-icons/fa';

import { FaRegFilePdf } from 'react-icons/fa6';
import { LuFileJson } from 'react-icons/lu';
import { Alert, Stack } from '@mui/joy';
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
  orderBy: Key
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string }
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
  comparator: (a: T, b: T) => number
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

function RowMenu({ experimentInfo, filename, mutate }) {
  return (
    <Dropdown>
      <MenuButton
        slots={{ root: IconButton }}
        slotProps={{ root: { variant: 'plain', color: 'neutral', size: 'sm' } }}
      >
        <MoreHorizRoundedIcon />
      </MenuButton>
      <Menu size="sm" sx={{ minWidth: 140 }}>
        <MenuItem>Edit</MenuItem>
        <MenuItem disabled>Rename</MenuItem>
        <Divider />
        <MenuItem
          color="danger"
          onClick={() => {
            fetch(
              chatAPI.Endpoints.Documents.Delete(experimentInfo?.id, filename)
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

export default function Documents({ experimentInfo }) {
  const [doc, setDoc] = React.useState<Doc>('desc');
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [open, setOpen] = React.useState(false);

  const [dropzoneActive, setDropzoneActive] = React.useState(false);

  const [previewFile, setPreviewFile] = React.useState<string | null>(null);

  const {
    data: rows,
    isLoading,
    mutate,
  } = useSWR(chatAPI.Endpoints.Documents.List(experimentInfo?.id), fetcher);

  const uploadFiles = async (formData) => {
    fetch(chatAPI.Endpoints.Documents.Upload(experimentInfo?.id), {
      method: 'POST',
      body: formData,
    })
      .then((response) => {
        if (response.ok) {
          mutate();
          return response.json();
        } else {
          throw new Error('File upload failed');
        }
      })
      .then((data) => {
        console.log('Server response:', data);
      })
      .catch((error) => {
        console.error('Error uploading file:', error);
      });
  };

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
              previewFile
            )}
            style={{ width: '100%', height: '100%' }}
          ></iframe>
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
        <FormLabel>Documents:</FormLabel>
        <IconButton
          color="primary"
          variant="plain"
          size="sm"
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
              await uploadFiles(formData);
            };
            input.click();
          }}
        >
          <PlusCircleIcon style={{ strokeWidth: '1.5px' }} />
        </IconButton>
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
          await uploadFiles(formData);
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
                  '--Table-headerUnderlineThickness': '1px',
                  '--TableRow-hoverBackground':
                    'var(--joy-palette-background-level1)',
                  '--TableCell-paddingY': '4px',
                  '--TableCell-paddingX': '8px',
                }}
              >
                <thead>
                  <tr>
                    {/* <th
                      style={{
                        textAlign: 'center',
                        padding: '12px 6px',
                      }}
                    >
                      <Checkbox
                        size="sm"
                        indeterminate={
                          selected.length > 0 &&
                          selected.length !== rows?.length
                        }
                        checked={selected.length === rows?.length}
                        onChange={(event) => {
                          setSelected(
                            event.target.checked
                              ? rows?.map((row) => row?.name)
                              : []
                          );
                        }}
                        color={
                          selected.length > 0 ||
                          selected.length === rows?.length
                            ? 'primary'
                            : undefined
                        }
                        sx={{ verticalAlign: 'text-bottom' }}
                      />
                    </th> */}
                    <th style={{ height: '10px' }}>
                      <Link
                        underline="none"
                        color="primary"
                        component="button"
                        onClick={() => setDoc(doc === 'asc' ? 'desc' : 'asc')}
                        fontWeight="lg"
                        endDecorator={<ArrowDropDownIcon />}
                        sx={{
                          '& svg': {
                            transition: '0.2s',
                            transform:
                              doc === 'desc'
                                ? 'rotate(0deg)'
                                : 'rotate(180deg)',
                          },
                        }}
                      >
                        File Name
                      </Link>
                    </th>
                    {/* <th style={{ padding: '12px 6px' }}>Date</th> */}
                    {/* <th style={{ padding: '12px 6px' }}>Type</th>{' '} */}
                    <th style={{ height: '10px' }}>
                      <Typography color="neutral">Size</Typography>
                    </th>
                    <th style={{ height: '10px', width: '20px' }}> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.length == 0 && (
                    <tr>
                      <td colSpan={2}>
                        <Alert
                          variant="outlined"
                          color="primary"
                          sx={{ marginTop: 2 }}
                        >
                          Drag and drop documents here to query their contents.
                        </Alert>
                      </td>
                    </tr>
                  )}
                  {stableSort(rows, getComparator(doc, 'id'))?.map((row) => (
                    <tr key={row?.name}>
                      {/* <td style={{ textAlign: 'center', width: 120 }}>
                        <Checkbox
                          size="sm"
                          checked={selected.includes(row?.name)}
                          color={
                            selected.includes(row?.name) ? 'primary' : undefined
                          }
                          onChange={(event) => {
                            setSelected((ids) =>
                              event.target.checked
                                ? ids.concat(row?.name)
                                : ids.filter((itemId) => itemId !== row?.name)
                            );
                          }}
                          slotProps={{
                            checkbox: { sx: { textAlign: 'left' } },
                          }}
                          sx={{ verticalAlign: 'text-bottom' }}
                        />
                      </td> */}
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ paddingLeft: '12px' }}
                        >
                          {row?.name}
                        </Typography>
                      </td>
                      {/* <td>
                        <Typography level="body-xs">{row?.date}</Typography>
                      </td> */}
                      {/* <td>
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
                      </td> */}
                      <td>
                        {row?.size && (
                          <Typography level="body-xs" color="neutral">
                            {formatBytes(row?.size)}
                          </Typography>
                        )}
                      </td>
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
                            Preview
                          </Button>
                          <RowMenu
                            experimentInfo={experimentInfo}
                            filename={row?.name}
                            mutate={mutate}
                          />
                        </Box>
                      </td>
                    </tr>
                  ))}
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
    </>
  );
}
