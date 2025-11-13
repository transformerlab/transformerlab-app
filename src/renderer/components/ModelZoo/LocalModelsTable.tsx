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
  IconButton,
  Skeleton, // added Skeleton
} from '@mui/joy';
import {
  ArrowRightToLineIcon,
  ArrowDownIcon,
  FlaskRoundIcon,
  InfoIcon,
  SearchIcon,
  StoreIcon,
  Trash2Icon,
  ImageIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useState } from 'react';

import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';
import * as chatAPI from '../../lib/transformerlab-api-sdk';

import { filterByFilters, licenseTypes, modelTypes } from '../../lib/utils';
import TinyMLXLogo from '../Shared/TinyMLXLogo';
import SelectButton from '../Experiment/SelectButton';
import { RiChatAiLine, RiImageAiLine } from 'react-icons/ri';

type Order = 'asc' | 'desc';

const LocalModelsTable = ({
  models,
  isLoading,
  mutateModels,
  setFoundation,
  setAdaptor,
  setEmbedding,
  pickAModelMode = false,
  showOnlyGeneratedModels = false,
  isEmbeddingMode = false,
  experimentInfo = null,
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

  // render loading skeleton when loading
  if (isLoading) {
    return (
      <>
        <Box
          className="SearchAndFilters-tabletUp"
          sx={{
            borderRadius: 'sm',
            mt: 1,
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
          <Skeleton
            variant="rectangular"
            sx={{ flex: 1, height: 32, borderRadius: 'sm' }}
          />
          <Skeleton
            variant="rectangular"
            sx={{ width: 160, height: 32, borderRadius: 'sm' }}
          />
          <Skeleton
            variant="rectangular"
            sx={{ width: 160, height: 32, borderRadius: 'sm' }}
          />
        </Box>

        <Sheet
          variant="outlined"
          sx={{
            width: '100%',
            borderRadius: 'md',
            minHeight: 0,
            display: 'flex',
            overflow: 'auto',
            p: 2,
          }}
        >
          <Box sx={{ width: '100%' }}>
            {[...Array(6)].map((_, idx) => (
              <Skeleton
                key={idx}
                variant="rectangular"
                sx={{ height: 48, borderRadius: 'sm', mb: 1 }}
              />
            ))}
          </Box>
        </Sheet>
      </>
    );
  }

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

        <FormControl size="sm">
          <FormLabel>&nbsp;</FormLabel>
          <IconButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => mutateModels()}
            aria-label="Reload models"
          >
            <RotateCcwIcon size="18px" />
            &nbsp; Refresh Models
          </IconButton>
        </FormControl>
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
              filterByFilters(models, searchText, filters)
                .filter(
                  (row) =>
                    !String(row?.json_data?.architecture || '')
                      .toLowerCase()
                      .includes('controlnet'),
                )
                .map((row) => {
                  if (showOnlyGeneratedModels && !row?.local_model == true) {
                    return null;
                  }
                  return (
                    <tr key={row.rowid}>
                      <td>
                        <Typography
                          ml={2}
                          fontWeight="lg"
                          startDecorator={
                            row?.json_data?.model_type === 'stable-diffusion' ||
                            row?.json_data?.model_type === 'diffusion' ? (
                              <RiImageAiLine />
                            ) : (
                              <RiChatAiLine />
                            )
                          }
                        >
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
                          )}
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
                            experimentInfo={experimentInfo}
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
                                  try {
                                    if (
                                      confirm(
                                        "Do you want to delete model '" +
                                          row.model_id +
                                          "' from your local Huggingface cache as well (if present) ?",
                                      )
                                    ) {
                                      await fetch(
                                        chatAPI.Endpoints.Models.Delete(
                                          row.model_id,
                                          true,
                                        ),
                                      );
                                    } else {
                                      await fetch(
                                        chatAPI.Endpoints.Models.Delete(
                                          row.model_id,
                                          false,
                                        ),
                                      );
                                    }

                                    await mutateModels();

                                    try {
                                      const currentFoundation =
                                        experimentInfo?.config?.foundation ||
                                        '';
                                      const currentFilename =
                                        experimentInfo?.config
                                          ?.foundation_filename || '';
                                      const foundationId = currentFoundation
                                        ? String(currentFoundation)
                                            .split('/')
                                            .slice(-1)[0]
                                        : '';

                                      const deletedMatchesFoundation =
                                        foundationId === row.model_id ||
                                        currentFoundation === row.model_id ||
                                        currentFilename === row.model_id ||
                                        currentFilename === row.local_path ||
                                        currentFoundation === row.local_path;

                                      if (
                                        deletedMatchesFoundation &&
                                        experimentInfo?.id
                                      ) {
                                        // optimistic clear in UI
                                        if (
                                          typeof setFoundation === 'function'
                                        ) {
                                          setFoundation(null);
                                        }

                                        // batch-update backend to clear all foundation-related fields
                                        await chatAPI.authenticatedFetch(
                                          chatAPI.Endpoints.Experiment.UpdateConfigs(
                                            experimentInfo.id,
                                          ),
                                          {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type':
                                                'application/json',
                                            },
                                            body: JSON.stringify({
                                              foundation: '',
                                              foundation_filename: '',
                                              foundation_model_architecture: '',
                                              inferenceParams: '{}',
                                            }),
                                          },
                                        );
                                      }
                                    } catch (err) {
                                      console.error(
                                        'Error clearing foundation after model deletion',
                                        err,
                                      );
                                    }
                                  } catch (e) {
                                    console.error('Failed to delete model', e);
                                    alert('Failed to delete model');
                                  }
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
        <ReactRouterLink to="/zoo">Model Store</ReactRouterLink>
      </Typography>
    </>
  );
};

export default LocalModelsTable;
