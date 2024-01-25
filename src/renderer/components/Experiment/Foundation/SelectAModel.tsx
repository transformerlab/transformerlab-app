/* eslint-disable jsx-a11y/anchor-is-valid */
import { useState } from 'react';

import {
  FormControl,
  FormLabel,
  Input,
  Select,
  Sheet,
  Table,
  Typography,
  Option,
  Chip,
  Link,
  Box,
  Stack,
  LinearProgress,
  Modal,
} from '@mui/joy';

import { Link as ReactRouterLink, useLocation } from 'react-router-dom';

import { ColorPaletteProp } from '@mui/joy/styles';

import {
  ArrowDownIcon,
  CheckIcon,
  CreativeCommonsIcon,
  GraduationCapIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react';
import SelectButton from '../SelectButton';
import CurrentFoundationInfo from './CurrentFoundationInfo';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

import { modelTypes, licenseTypes, filterByFilters } from '../../../lib/utils';

type Order = 'asc' | 'desc';

function convertModelObjectToArray(modelObject) {
  // The model object in the storage is big object,
  // Here we turn that into an array of objects

  const arr = [{}];
  const keys = Object.keys(modelObject);

  for (let i = 0, n = keys.length; i < n; i++) {
    const key = keys[i];
    arr[i] = modelObject[key];
    arr[i].name = key;
  }

  return arr;
}

function openModelFolderInFilesystem() {
  //window.filesys.openModelFolder();
}

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function SelectAModel({
  experimentInfo,
  setFoundation = (model) => {},
  setAdaptor = (name: string) => {},
}) {
  const [order, setOrder] = useState<Order>('desc');
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher
  );

  const location = useLocation();

  function foundationSetter(model) {
    setOpen(true);

    setFoundation(model);

    setAdaptor('');

    setOpen(false);
  }

  const renderFilters = () => (
    <>
      <FormControl size="sm">
        <FormLabel>License</FormLabel>
        <Select
          placeholder="Filter by license"
          slotProps={{ button: { sx: { whiteSpace: 'nowrap' } } }}
          value={filters?.license}
          disabled
          onChange={(e, newValue) => {
            setFilters({ ...filters, license: newValue });
          }}
        >
          {licenseTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
      <FormControl size="sm">
        <FormLabel>Architecture</FormLabel>
        <Select
          placeholder="All"
          disabled
          value={filters?.architecture}
          onChange={(e, newValue) => {
            setFilters({ ...filters, architecture: newValue });
          }}
        >
          {modelTypes.map((type) => (
            <Option value={type}>{type}</Option>
          ))}
        </Select>
      </FormControl>
    </>
  );

  if (experimentInfo?.config?.foundation) {
    return (
      <CurrentFoundationInfo
        experimentInfo={experimentInfo}
        foundation={experimentInfo?.config?.adaptor}
        setFoundation={setFoundation}
        adaptor={experimentInfo?.config?.adaptor}
        setAdaptor={setAdaptor}
      />
    );
  }

  if (!experimentInfo && location?.pathname !== '/zoo') {
    return 'Select an Experiment';
  }

  return (
    <>
      <Typography level="h1" mb={2}>
        Local Models
      </Typography>
      <Modal
        aria-labelledby="modal-title"
        aria-describedby="modal-desc"
        open={open}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Sheet
          variant="outlined"
          sx={{
            maxWidth: 500,
            borderRadius: 'md',
            p: 3,
            boxShadow: 'lg',
          }}
        >
          <Typography
            component="h2"
            id="modal-title"
            level="h4"
            textColor="inherit"
            fontWeight="lg"
            mb={1}
          >
            Preparing Model
          </Typography>
          <Typography id="modal-desc" textColor="text.tertiary">
            <Stack spacing={2} sx={{ flex: 1 }}>
              Quantizing Parameters:
              <LinearProgress />
            </Stack>
          </Typography>
        </Sheet>
      </Modal>
      <Box
        className="SearchAndFilters-tabletUp"
        sx={{
          borderRadius: 'sm',
          py: 2,
          display: {
            xs: 'flex',
            sm: 'flex',
          },
          flexWrap: 'wrap',
          gap: 1.5,
          '& > *': {
            minWidth: {
              xs: '120px',
              md: '160px',
            },
          },
        }}
      >
        <FormControl sx={{ flex: 1 }} size="sm">
          <FormLabel>&nbsp;</FormLabel>
          <Input
            placeholder="Search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </FormControl>

        {renderFilters()}
      </Box>
      <Sheet
        className="OrderTableContainer"
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 'md',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
        }}
      >
        <Table
          aria-labelledby="tableTitle"
          stickyHeader
          hoverRow
          sx={{
            '--TableCell-headBackground': (theme) =>
              theme.vars.palette.background.level1,
            '--Table-headerUnderlineThickness': '1px',
            '--TableRow-hoverBackground': (theme) =>
              theme.vars.palette.background.level1,
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 140, padding: 12 }}>
                <Link
                  underline="none"
                  color="primary"
                  component="button"
                  onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                  fontWeight="lg"
                  endDecorator={<ArrowDownIcon />}
                  sx={{
                    '& svg': {
                      transition: '0.2s',
                      transform:
                        order === 'desc' ? 'rotate(0deg)' : 'rotate(180deg)',
                    },
                  }}
                >
                  Name
                </Link>
              </th>
              <th style={{ width: 120, padding: 12 }}>Params</th>
              <th style={{ width: 120, padding: 12 }}>License</th>
              {/* <th style={{ width: 220, padding: 12 }}>Type</th> */}
              <th style={{ width: 120, padding: 12 }}>&nbsp;</th>
              <th style={{ width: 160, padding: 12 }}> </th>
            </tr>
          </thead>
          <tbody>
            {data &&
              filterByFilters(data, searchText, filters).map((row) => (
                <tr key={row.rowid}>
                  <td>
                    <Typography ml={2} fontWeight="lg">
                      {row.name}
                    </Typography>
                  </td>
                  <td>{row?.json_data?.parameters}</td>
                  <td>
                    <Chip
                      variant="soft"
                      size="sm"
                      startDecorator={
                        {
                          MIT: <CheckIcon />,
                          Apache: <GraduationCapIcon />,
                          CC: <CreativeCommonsIcon />,
                        }[row.status]
                      }
                      color={
                        {
                          MIT: 'success',
                          Apache: 'neutral',
                          CC: 'success',
                        }[row.status] as ColorPaletteProp
                      }
                    >
                      {row?.json_data?.license}
                    </Chip>
                  </td>
                  <td>{row.model_id}</td>
                  <td style={{ textAlign: 'right' }}>
                    <SelectButton
                      setFoundation={foundationSetter}
                      model={row}
                      setAdaptor={setAdaptor}
                    />
                  </td>
                </tr>
              ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Typography
                    level="body-lg"
                    justifyContent="center"
                    margin={5}
                  >
                    You do not have any models on your local machine. You can
                    download a model by going to the{' '}
                    <ReactRouterLink to="/zoo">
                      <StoreIcon />
                      Model Store
                    </ReactRouterLink>
                    .
                  </Typography>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Sheet>
    </>
  );
}
