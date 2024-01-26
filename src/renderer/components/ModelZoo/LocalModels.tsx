/* eslint-disable jsx-a11y/anchor-is-valid */
import { useCallback, useEffect, useState } from 'react';

import {
  Button,
  Checkbox,
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

import TinyMLXLogo from '../Shared/TinyMLXLogo';

import {
  ArrowDownIcon,
  BoxesIcon,
  CheckIcon,
  CloudIcon,
  CreativeCommonsIcon,
  DownloadCloudIcon,
  FlaskRoundIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  InfoIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  Trash2Icon,
} from 'lucide-react';
import SelectButton from '../Experiment/SelectButton';
import CurrentFoundationInfo from '../Experiment/Foundation/CurrentFoundationInfo';
import useSWR from 'swr';
import * as chatAPI from '../../lib/transformerlab-api-sdk';
import Welcome from '../Welcome';

import { modelTypes, licenseTypes, filterByFilters } from '../../lib/utils';

type Order = 'asc' | 'desc';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function LocalModels({
  pickAModelMode = false,
  experimentInfo,
  setFoundation = (name: string) => {},
  setAdaptor = (name: string) => {},
}) {
  const [order, setOrder] = useState<Order>('desc');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const [localModels, setLocalModels] = useState([]);

  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher
  );

  const location = useLocation();

  const foundationSetter = useCallback(async (name) => {
    setOpen(true);

    setFoundation(name);
    const escapedModelName = name.replaceAll('.', '\\.');

    setAdaptor('');

    setOpen(false);
  }, []);

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

  if (pickAModelMode && experimentInfo?.config?.foundation) {
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
    return <Welcome />;
  }

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* <Typography level="h1">Local Models</Typography> */}
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
          pb: 2,
          display: 'flex',
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
        className=""
        variant="outlined"
        sx={{
          width: '100%',
          borderRadius: 'md',
          minHeight: 0,
          display: 'flex',
          overflow: 'auto',
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
            height: '100px',
            overflow: 'auto',
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
              <th style={{ width: 120, padding: 12 }}>Architecture</th>
              <th style={{ width: 120, padding: 12 }}>Params</th>
              {/* <th style={{ width: 220, padding: 12 }}>Type</th> */}
              <th style={{ width: 120, padding: 12 }}>Model ID</th>
              <th style={{ width: 160, padding: 12 }}> </th>
            </tr>
          </thead>
          <tbody>
            {data &&
              filterByFilters(data, searchText, filters).map((row) => (
                <tr key={row.rowid}>
                  <td>
                    <Typography ml={2} fontWeight="lg">
                      {row?.local_model === true ? (
                        <FlaskRoundIcon
                          color="var(--joy-palette-success-700)"
                          style={{
                            verticalAlign: 'middle',
                            marginRight: '5px',
                          }}
                        />
                      ) : (
                        <DownloadCloudIcon
                          color="var(--joy-palette-primary-700)"
                          style={{
                            verticalAlign: 'middle',
                            marginRight: '5px',
                          }}
                        />
                      )}{' '}
                      {row.name}
                    </Typography>
                  </td>
                  <td>
                    {' '}
                    {row?.json_data?.architecture == 'MLX' && (
                      <>
                        <TinyMLXLogo />
                        &nbsp;
                      </>
                    )}
                    {row?.json_data?.architecture}
                  </td>
                  <td>{row?.json_data?.parameters}</td>
                  {/* <td>{JSON.stringify(row)}</td> */}
                  {/* <td>
        <Box
          sx={{ display: "flex", gap: 2, alignItems: "center" }}
        ></Box>
      </td> */}
                  <td>{row.model_id}</td>
                  <td style={{ textAlign: 'right' }}>
                    {/* <Link fontWeight="lg" component="button" color="neutral">
        Archive
      </Link> */}
                    {pickAModelMode === true ? (
                      <SelectButton
                        setFoundation={foundationSetter}
                        name={row.name}
                        setAdaptor={setAdaptor}
                      />
                    ) : (
                      <>
                        <InfoIcon
                          onClick={() => {
                            alert(JSON.stringify(row?.json_data));
                          }}
                        />
                        &nbsp;
                        <Trash2Icon
                          color="var(--joy-palette-danger-600)"
                          onClick={async () => {
                            if (
                              confirm(
                                "Are you sure you want to delete model '" +
                                  row.model_id +
                                  "'?"
                              )
                            ) {
                              await fetch(
                                chatAPI.Endpoints.Models.Delete(row.model_id)
                              );
                              mutate();
                            }
                          }}
                        />
                      </>
                    )}
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
      <Box
        sx={{
          justifyContent: 'space-between',
          display: 'flex',
          width: '100%',
          paddingTop: '12px',
          flex: 1,
          alignSelf: 'flex-end',
        }}
      >
        {pickAModelMode === true ? (
          ''
        ) : (
          <div
            style={{
              width: '100%',
              alignSelf: 'flex-end',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <FormControl>
              <Input
                placeholder="decapoda-research/llama-30b-hf"
                name="download-model-name"
                endDecorator={
                  <Button
                    onClick={async (e) => {
                      const model = document.getElementsByName(
                        'download-model-name'
                      )[0].value;
                      await chatAPI.downloadModel(model);
                    }}
                  >
                    Download 🤗 Model
                  </Button>
                }
                sx={{ width: '500px' }}
              />
            </FormControl>
            {/* <Button
              size="sm"
              sx={{ height: '30px' }}
              endDecorator={<PlusIcon />}
            >
              New
            </Button> */}
          </div>
        )}
      </Box>
    </Sheet>
  );
}
