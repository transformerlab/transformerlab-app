/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';
import {
  Box,
  Button,
  ButtonGroup,
  IconButton,
  Stack,
  Table,
  Typography,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Input,
  Textarea,
  FormControl,
  FormLabel,
  FormHelperText,
} from '@mui/joy';
import {
  Trash2Icon,
  Undo2Icon,
  SearchIcon,
  DownloadIcon,
  CheckIcon,
} from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import ModelDetails from './ModelDetails';
import DownloadProgressBox from '../../Shared/DownloadProgressBox';
import ModelProvenanceTimeline from './ModelProvenanceTimeline';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from 'renderer/lib/transformerlab-api-sdk';

const DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-base-en-v1.5';

const fetchWithPost = ({ url, post }) =>
  fetch(url, {
    method: 'POST',
    body: post,
  }).then((res) => res.json());

const fetcher = (url) => fetch(url).then((res) => res.json());

function modelNameIsInHuggingfaceFormat(modelName: string) {
  return modelName.includes('/');
}

const hf_config_translation = {
  architectures: 'Architecture',
  max_position_embeddings: 'Context Window',
  max_sequence_length: 'Context Window',
  seq_length: 'Context Window',
  max_seq_len: 'Context Window',
  model_max_length: 'Context Window',
  attention_dropout: 'Attention Dropout',
  bos_token_id: 'BOS Token ID',
  bos_token: 'BOS Token',
  classifier_dropout: 'Classifier Dropout',
  decoder_start_token_id: 'Decoder Start Token ID',
  decoder_start_token: 'Decoder Start Token',
  dropout: 'Dropout',
  d_ff: 'Feed Forward Dimension',
  d_kv: 'Key/Value Dimension',
  d_model: 'Model Dimensions',
  num_heads: 'Number of Heads',
  num_layers: 'Number of Layers',
  vocab_size: 'Vocabulary Size',
};

function hf_translate(key) {
  return hf_config_translation[key] || null;
}

export default function CurrentFoundationInfo({
  experimentInfo,
  setFoundation,
  adaptor,
  setAdaptor,
  setLogsDrawerOpen = null,
}) {
  const { data: peftData, mutate: peftMutate } = useSWR(
    {
      url: chatAPI.Endpoints.Models.GetPeftsForModel(),
      post: experimentInfo?.config?.foundation,
    },
    fetchWithPost,
  );

  const { mutate: experimentInfoMutate } = useSWR(
    chatAPI.Endpoints.Experiment.Get(experimentInfo?.id),
    fetcher,
  );

  const [huggingfaceData, setHugggingfaceData] = useState({});
  const [showProvenance, setShowProvenance] = useState(false);
  const [selectedProvenanceModel, setSelectedProvenanceModel] = useState(null);
  const huggingfaceId = experimentInfo?.config?.foundation;
  const [embeddingModel, setEmbeddingModel] = useState(
    experimentInfo?.config?.embedding_model,
  );
  const [activeTab, setActiveTab] = useState(0);
  const navigate = useNavigate();

  // New state for adapter search & install
  const [adapterSearchText, setAdapterSearchText] = useState('');
  const [jobId, setJobId] = useState(null);
  const [currentlyInstalling, setCurrentlyInstalling] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const { data: baseProvenance, error: baseProvenanceError } = useSWR(
    chatAPI.Endpoints.Models.ModelProvenance(huggingfaceId),
    fetcher,
  );

  const { data: serverInfo } = useSWR(
    chatAPI.Endpoints.ServerInfo.Get(),
    fetcher,
  );
  const device = serverInfo?.device;

  const { data: adaptorProvenance, error: adaptorProvenanceError } = useSWR(
    selectedProvenanceModel && selectedProvenanceModel !== huggingfaceId
      ? chatAPI.Endpoints.Models.ModelProvenance(
          `${huggingfaceId}_${selectedProvenanceModel}`,
        )
      : null,
    fetcher,
  );

  const currentProvenance =
    selectedProvenanceModel === huggingfaceId
      ? baseProvenance
      : adaptorProvenance;
  const currentProvenanceError =
    selectedProvenanceModel === huggingfaceId
      ? baseProvenanceError
      : adaptorProvenanceError;

  useEffect(() => {
    setSelectedProvenanceModel(huggingfaceId);
  }, [huggingfaceId]);

  const pollJobStatus = (jobId) => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(chatAPI.Endpoints.Jobs.Get(jobId));
        const result = await response.json();

        if (
          result.status === 'SUCCESS' ||
          result.status === 'FAILED' ||
          result.status === 'UNAUTHORIZED' ||
          result.status === 'COMPLETE'
        ) {
          clearInterval(intervalId);

          if (result.status === 'SUCCESS' || result.status === 'COMPLETE') {
            alert(
              result.job_data?.success_msg || 'Adapter installed successfully!',
            );
          } else {
            alert(
              result.job_data?.error_msg ||
                'Adapter install failed with unknown error.',
            );
          }

          setCurrentlyInstalling(null);
          setJobId(null);
          peftMutate(); // Refresh installed adapters
        }
      } catch (error) {
        console.error('Error fetching job status:', error);
        clearInterval(intervalId);
        setCurrentlyInstalling(null);
        setJobId(null);
        alert('An error occurred while checking the adapter install status.');
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleAdapterDownload = async () => {
    const adapterId = adapterSearchText.trim();
    if (!adapterId) {
      alert('Please enter an adapter ID.');
      return;
    }
    const installedResponse = await fetch(
      chatAPI.Endpoints.Models.GetPeftsForModel(),
      {
        method: 'POST',
        body: experimentInfo.config.foundation,
      },
    );
    const installed = await installedResponse.json(); // sanitized names (e.g., sheenrooff_Llama...)
    const secureAdapterId = adapterSearchText.replace(/\//g, '_');

    if (installed.includes(secureAdapterId)) {
      const shouldReplace = confirm(
        'This adapter is already installed. Do you want to install it again? This will replace the existing version.',
      );
      if (!shouldReplace) return;

      // Delete existing adapter first
      await fetch(
        getAPIFullPath('models', ['deletePeft'], {
          modelId: experimentInfo.config.foundation,
          peft: secureAdapterId,
        }),
      );
    }

    setCurrentlyInstalling(adapterId); // track progress immediately

    try {
      const response = await fetch(
        getAPIFullPath('models', ['installPeft'], {
          modelId: experimentInfo?.config?.foundation,
          peft: adapterId,
        }),
        { method: 'POST' },
      );

      const result = await response.json();
      const status = result.check_status || {};

      const warnings = Object.entries(status).filter(
        ([_, v]) => v === 'fail' || v === 'unknown',
      );
      if (warnings.length > 0) {
        const warningKeys = warnings.map(([k]) => k).join(', ');
        alert(
          `⚠️ Warning: Compatibility issues detected for: ${warningKeys}. Adapter installation will proceed anyway.`,
        );
      }

      if (result.status === 'started') {
        setJobId(result.job_id);
        pollJobStatus(result.job_id);
      } else {
        alert(
          `Failed to start adapter install: ${result.message || 'Unknown error'}`,
        );
        setCurrentlyInstalling(null);
      }
    } catch (error) {
      console.error('Error during install:', error);
      alert('Install failed due to a server or network error.');
      setCurrentlyInstalling(null);
    }
  };

  const handleCancelDownload = async () => {
    if (jobId) {
      setCanceling(true);
      const response = await fetch(getAPIFullPath('jobs', ['stop'], { jobId }));
      if (response.ok) {
        setJobId(null);
        setCurrentlyInstalling(null);
      } else {
        alert('Failed to cancel installation');
      }
      setCanceling(false);
    }
  };

  const resetToDefaultEmbedding = async () => {
    setEmbeddingModel(DEFAULT_EMBEDDING_MODEL);
    try {
      await fetch(
        chatAPI.Endpoints.Experiment.UpdateConfigs(experimentInfo?.id),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            embedding_model: DEFAULT_EMBEDDING_MODEL,
            embedding_model_filename: '',
            embedding_model_architecture: 'BertModel',
          }),
        },
      );
      experimentInfoMutate();
    } catch (error) {
      console.error('Failed to reset embedding model:', error);
    }
  };

  useMemo(() => {
    if (experimentInfo?.config?.foundation_filename) {
      fetch(chatAPI.Endpoints.Models.ModelDetailsFromFilesystem(huggingfaceId))
        .then((res) => res.json())
        .catch((error) => console.log(error));
      setHugggingfaceData({});
    } else if (huggingfaceId && modelNameIsInHuggingfaceFormat(huggingfaceId)) {
      fetch(chatAPI.Endpoints.Models.GetLocalHFConfig(huggingfaceId))
        .then((res) => res.json())
        .then((data) => setHugggingfaceData(data))
        .catch((error) => console.log(error));
    } else {
      setHugggingfaceData({});
    }
  }, [experimentInfo]);

  useEffect(() => {
    if (experimentInfo?.config?.embedding_model) {
      setEmbeddingModel(experimentInfo.config.embedding_model);
    } else {
      resetToDefaultEmbedding();
    }
  }, [experimentInfo?.config?.embedding_model]);

  const handleEmbeddingModelClick = () => {
    navigate('/experiment/embedding-model', {
      state: {
        currentEmbeddingModel: embeddingModel,
        experimentId: experimentInfo?.id,
      },
    });
  };

  const { data, error, isLoading } = useAPI(
    'models',
    ['chatTemplate'],
    { modelName: huggingfaceId },
    { enabled: !!huggingfaceId },
  );
  // console.log('data', data);

  return (
    <Sheet
      sx={{
        height: '100%',
        //display: 'flex',
        flexDirection: 'column',
        paddingBottom: '20px',
      }}
    >
      <ModelDetails
        experimentInfo={experimentInfo}
        adaptor={adaptor}
        setAdaptor={setAdaptor}
        setFoundation={setFoundation}
        setLogsDrawerOpen={setLogsDrawerOpen}
      />
      <Tabs
        aria-label="Model tabs"
        value={activeTab}
        onChange={(event, value) => setActiveTab(value)}
        sx={{
          mt: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
        }}
      >
        <TabList>
          <Tab>Overview</Tab>
          <Tab>Embedding Models</Tab>
          <Tab>Adaptors</Tab>
          <Tab>Provenance</Tab>
          <Tab>Chat Template</Tab>
        </TabList>

        {/* Overview Tab */}
        <TabPanel
          value={0}
          sx={{
            p: 2,
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <Sheet
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 'md',
              overflow: 'auto',
              maxHeight: '500px',
            }}
          >
            {Object.keys(huggingfaceData).length === 0 ||
            !Object.entries(huggingfaceData).some(
              (row) => hf_translate(row[0]) !== null,
            ) ? (
              <Typography level="body-sm" color="neutral" sx={{ p: 2 }}>
                No configuration data available for this model. This may happen
                with local models or when the model info hasn't been loaded yet.
              </Typography>
            ) : (
              <Table id="huggingface-model-config-info">
                <tbody>
                  {Object.entries(huggingfaceData).map(
                    (row) =>
                      hf_translate(row[0]) !== null && (
                        <tr key={row[0]}>
                          <td>{hf_translate(row[0])}</td>
                          <td>{JSON.stringify(row[1])}</td>
                        </tr>
                      ),
                  )}
                </tbody>
              </Table>
            )}
          </Sheet>
        </TabPanel>

        <TabPanel value={1} sx={{ p: 2 }}>
          <Stack
            direction="column"
            spacing={2}
            style={{ overflow: 'auto', maxHeight: '500px' }}
          >
            <Sheet
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 'sm',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  mt: 2,
                  mb: 1,
                  px: 2,
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography level="title-md" marginBottom={1}>
                    Embedding Model:
                  </Typography>
                  <ButtonGroup size="sm">
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleEmbeddingModelClick}
                      sx={{ width: 'fit-content' }}
                    >
                      {embeddingModel}
                    </Button>
                    <Button
                      startDecorator={<Undo2Icon size={16} />}
                      onClick={resetToDefaultEmbedding}
                    >
                      Reset to Default
                    </Button>
                  </ButtonGroup>
                </Box>
              </Box>
            </Sheet>
          </Stack>
        </TabPanel>

        {/* Adaptors Tab */}
        <TabPanel
          value={2}
          sx={{
            p: 1,
            height: '100%',
            overflowY: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Typography level="title-lg" marginBottom={2}>
            Download an Adapter from HuggingFace 🤗
          </Typography>

          {/* Download progress box */}
          {currentlyInstalling && jobId && (
            <Sheet
              sx={{
                borderRadius: 'md',
                p: 2,
                my: 2,
                position: 'relative',
              }}
            >
              <Box sx={{ position: 'relative', marginBottom: 2 }}>
                <DownloadProgressBox
                  jobId={jobId}
                  assetName={currentlyInstalling}
                />

                {jobId && (
                  <Button
                    variant="outlined"
                    size="sm"
                    color="neutral"
                    disabled={canceling}
                    onClick={handleCancelDownload}
                    sx={{ position: 'absolute', top: '1rem', right: '1rem' }}
                  >
                    {canceling ? 'Stopping...' : 'Cancel Installation'}
                  </Button>
                )}
              </Box>
            </Sheet>
          )}

          {/* Search bar */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
            <Input
              placeholder="Enter Adapter ID"
              value={adapterSearchText}
              onChange={(e) => setAdapterSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdapterDownload();
                }
              }}
              startDecorator={<DownloadIcon />}
            />
            <Button onClick={handleAdapterDownload}>Download</Button>
          </Box>

          {/* Installed adapters section */}
          <Typography level="title-lg" mt={1}>
            Available Adaptors
          </Typography>
          <Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 1 }}>
            <Stack direction="column" gap={1}>
              {peftData && peftData.length === 0 && (
                <Typography level="body-sm" color="neutral">
                  No adaptors installed. Train one!
                </Typography>
              )}
              {peftData &&
                peftData.map((peft) => (
                  <Sheet
                    key={peft}
                    variant="outlined"
                    sx={{
                      p: 1,
                      borderRadius: 'sm',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Typography level="title-md">
                      {peft.replace('_', '/')}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant={adaptor === peft ? 'solid' : 'soft'}
                        color="primary"
                        onClick={() => {
                          if (adaptor === peft) {
                            fetch(
                              chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
                                experimentInfo?.id,
                                'adaptor',
                                '',
                              ),
                            ).then(() => {
                              setAdaptor('');
                            });
                          } else {
                            fetch(
                              chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
                                experimentInfo?.id,
                                'adaptor',
                                peft,
                              ),
                            ).then(() => {
                              setAdaptor(peft);
                            });
                          }
                        }}
                      >
                        {adaptor === peft ? 'Selected' : 'Select'}
                      </Button>
                      <IconButton
                        variant="plain"
                        color="danger"
                        onClick={() => {
                          if (
                            confirm(
                              'Are you sure you want to delete this adaptor?',
                            )
                          ) {
                            fetch(
                              getAPIFullPath('models', ['deletePeft'], {
                                modelId: experimentInfo?.config?.foundation,
                                peft,
                              }),
                            ).then(() => {
                              peftMutate();
                            });
                          }
                        }}
                      >
                        <Trash2Icon />
                      </IconButton>
                    </Box>
                  </Sheet>
                ))}
            </Stack>
          </Box>
        </TabPanel>

        {/* Provenance Tab */}
        <TabPanel value={3} sx={{ p: 2, height: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            {/* Provenance model selector */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mb: 2,
                flexWrap: 'wrap',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Typography level="body-sm">View:</Typography>
                <Chip
                  size="sm"
                  variant={
                    selectedProvenanceModel === huggingfaceId ? 'solid' : 'soft'
                  }
                  color="primary"
                  onClick={() => setSelectedProvenanceModel(huggingfaceId)}
                  sx={{ cursor: 'pointer' }}
                >
                  Base Model
                </Chip>

                {peftData &&
                  peftData.map((peft) => (
                    <Chip
                      key={peft}
                      size="sm"
                      variant={
                        selectedProvenanceModel === peft ? 'solid' : 'soft'
                      }
                      color="primary"
                      onClick={() => setSelectedProvenanceModel(peft)}
                      sx={{ cursor: 'pointer' }}
                    >
                      {peft}
                    </Chip>
                  ))}
              </Box>
            </Box>

            {selectedProvenanceModel !== huggingfaceId && (
              <Box
                sx={{
                  mb: 2,
                  p: 1,
                  bgcolor: 'background.level1',
                  borderRadius: '4px',
                }}
              >
                <Typography level="body-sm" fontWeight="bold">
                  Showing provenance for: {huggingfaceId}_
                  {selectedProvenanceModel}
                </Typography>
              </Box>
            )}

            <Box
              sx={{
                flexGrow: 1,
                overflow: 'auto',
              }}
            >
              {currentProvenance ? (
                <ModelProvenanceTimeline
                  provenance={currentProvenance}
                  modelName={
                    selectedProvenanceModel === huggingfaceId
                      ? huggingfaceId
                      : `${huggingfaceId}_${selectedProvenanceModel}`
                  }
                  isAdaptor={selectedProvenanceModel !== huggingfaceId}
                />
              ) : currentProvenanceError ? (
                <Typography>Error loading provenance data</Typography>
              ) : (
                <Typography>No Provenance Data Found</Typography>
              )}
            </Box>
          </Box>
        </TabPanel>

        {/* Chat Template Tab */}
        <TabPanel
          value={4}
          sx={{
            p: 2,
            overflowY: 'auto',
            maxHeight: '500px',
          }}
        >
          <FormControl sx={{ mb: 2 }}>
            <textarea rows={11} value={data?.data ?? ''} readOnly />
            <FormHelperText>
              This template defines how chat messages are formatted as model
              input during training or inference. It uses Jinja2 syntax.
            </FormHelperText>
          </FormControl>

          {error && (
            <Typography level="body-sm" color="danger" mt={1}>
              Error loading template: {data?.message}
            </Typography>
          )}

          {isLoading && (
            <Typography level="body-sm" color="neutral" mt={1}>
              Loading chat template...
            </Typography>
          )}
        </TabPanel>
      </Tabs>
    </Sheet>
  );
}
