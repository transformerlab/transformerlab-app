import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Link,
  Select,
  Sheet,
  Table,
  Typography,
  Option,
  Button,
} from '@mui/joy';
import {
  ArrowRightToLineIcon,
  ArrowDownIcon,
  FlaskRoundIcon,
  InfoIcon,
  SearchIcon,
  StoreIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

import { filterByFilters, licenseTypes, modelTypes } from '../../lib/utils';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import SelectButton from '../Experiment/SelectButton';

type Order = 'asc' | 'desc';

const LocalModelsTable = ({
  models,
  mutateModels,
  setFoundation,
  setAdaptor,
  setEmbedding,
  pickAModelMode = false,
  showOnlyGeneratedModels = false,
  isEmbeddingMode = false,
}) => {
  const [order, setOrder] = useState<Order>('desc');
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});

  const navigate = useNavigate();

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
            <Option value={type} key={type}>
              {type}
            </Option>
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
            <Option value={type} key={type}>
              {type}
            </Option>
          ))}
        </Select>
      </FormControl>
    </>
  );

  return (
    <>
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
              <th style={{ width: 180, padding: 12 }}>
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
              <th style={{ width: 150, padding: 12 }}>Architecture</th>
              <th style={{ width: 60, padding: 12 }}>Params</th>
              {/* <th style={{ width: 220, padding: 12 }}>Type</th> */}
              <th style={{ width: 180, padding: 12 }}>Model ID</th>
              <th style={{ width: 60, padding: 12 }}> </th>
            </tr>
          </thead>
          <tbody>
            {models &&
              filterByFilters(models, searchText, filters).map((row) => {
                if (showOnlyGeneratedModels && !row?.local_model == true) {
                  return null;
                }
                return (
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
                        ) : row?.source && row?.source != 'transformerlab' ? (
                          <ArrowRightToLineIcon
                            color="var(--joy-palette-success-700)"
                            style={{
                              verticalAlign: 'middle',
                              marginRight: '5px',
                            }}
                          />
                        ) : (
                          ''
                        )}{' '}
                        {row.name}
                      </Typography>
                    </td>
                    <td>
                      <Typography style={{ overflow: 'hidden' }}>
                        {' '}
                        {row?.json_data?.architecture == 'MLX' && (
                          <>
                            <TinyMLXLogo />
                            &nbsp;
                          </>
                        )}
                        {row?.json_data?.architecture == 'GGUF' && (
                          <>
                            <img
                              src="https://avatars.githubusercontent.com/ggerganov"
                              width="24"
                              valign="middle"
                              style={{ borderRadius: '50%' }}
                            />{' '}
                            &nbsp;
                          </>
                        )}
                        {[
                          'FalconForCausalLM',
                          'Gemma2ForCausalLM',
                          'GPTBigCodeForCausalLM',
                          'LlamaForCausalLM',
                          'MistralForCausalLM',
                          'Phi3ForCausalLM',
                          'Qwen2ForCausalLM',
                          'T5ForConditionalGeneration',
                        ].includes(row?.json_data?.architecture) && (
                          <>🤗 &nbsp;</>
                        )}
                        {row?.json_data?.architecture}
                      </Typography>
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
                          setFoundation={setFoundation}
                          setAdaptor={setAdaptor}
                          setEmbedding={setEmbedding}
                          model={row}
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
                                    "'?",
                                )
                              ) {
                                await fetch(
                                  chatAPI.Endpoints.Models.Delete(row.model_id),
                                );
                                mutateModels();
                              }
                            }}
                          />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            {models?.length === 0 && (
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
      <Typography mt={2} level="body-sm">
        Looking for more models? Go to the{' '}
        <ReactRouterLink to="/zoo/store">Model Store</ReactRouterLink>
      </Typography>
    </>
  );
};

export default LocalModelsTable;
