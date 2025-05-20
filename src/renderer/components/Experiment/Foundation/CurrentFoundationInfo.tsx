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
} from '@mui/joy';
import { Trash2Icon, Undo2Icon, LayersIcon } from 'lucide-react';

import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ModelDetails from './ModelDetails';
import ModelProvenanceTimeline from './ModelProvenanceTimeline';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const {
    data: peftData,
    error: peftError,
    mutate: peftMutate,
  } = useSWR(
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

  // Fetch base model provenance
  const { data: baseProvenance, error: baseProvenanceError } = useSWR(
    chatAPI.Endpoints.Models.ModelProvenance(huggingfaceId),
    fetcher,
  );

  // Fetch adaptor provenance when selected
  const { data: adaptorProvenance, error: adaptorProvenanceError } = useSWR(
    selectedProvenanceModel && selectedProvenanceModel !== huggingfaceId
      ? chatAPI.Endpoints.Models.ModelProvenance(
          `${huggingfaceId}_${selectedProvenanceModel}`,
        )
      : null,
    fetcher,
  );

  // Show proper provenance data based on selection
  const currentProvenance =
    selectedProvenanceModel === huggingfaceId
      ? baseProvenance
      : adaptorProvenance;
  const currentProvenanceError =
    selectedProvenanceModel === huggingfaceId
      ? baseProvenanceError
      : adaptorProvenanceError;

  // Reset selected provenance model when base model changes
  useEffect(() => {
    setSelectedProvenanceModel(huggingfaceId);
  }, [huggingfaceId]);

  const resetToDefaultEmbedding = async () => {
    // Update local state
    setEmbeddingModel(DEFAULT_EMBEDDING_MODEL);
    try {
      // Update backend configuration
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model',
          DEFAULT_EMBEDDING_MODEL,
        ),
      );

      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model_filename',
          '',
        ),
      );

      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model_architecture',
          'BertModel',
        ),
      );
      experimentInfoMutate();
    } catch (error) {
      console.error('Failed to reset embedding model:', error);
    }
  };

  useMemo(() => {
    // This is a local model
    if (experimentInfo?.config?.foundation_filename) {
      // TODO: Load in model details from the filesystem
      fetch(chatAPI.Endpoints.Models.ModelDetailsFromFilesystem(huggingfaceId))
        .then((res) => res.json())
        .catch((error) => console.log(error));
      setHugggingfaceData({});

      // Try to see if this is a HuggingFace model
    } else if (huggingfaceId && modelNameIsInHuggingfaceFormat(huggingfaceId)) {
      fetch(chatAPI.Endpoints.Models.GetLocalHFConfig(huggingfaceId))
        .then((res) => res.json())
        .then((data) => setHugggingfaceData(data))
        .catch((error) => console.log(error));
    } else {
      setHugggingfaceData({});
    }
  }, [experimentInfo]);

  // Add useEffect to update embeddingModel when experimentInfo changes
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

  const handleModelVisualizationClick = async () => {
    try {
      // Check if the local model server is running by checking worker health
      const response = await fetch(
        `${chatAPI.INFERENCE_SERVER_URL()}server/worker_healthz`,
      );
      const data = await response.json();

      if (response.status === 200 && Array.isArray(data) && data.length > 0) {
        // Model server is running, navigate to visualization page
        navigate('/experiment/model_architecture_visualization');
      } else {
        // Server responded but workers aren't ready
        alert('Please Run the model before visualizing its architecture');
      }
    } catch (error) {
      console.error('Failed to check model server status:', error);
      alert('Please Run the model before visualizing its architecture');
    }
  };

  return (
    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
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

      {/* Moved embedding model and visualization buttons above tabs */}
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

        <Button
          variant="outlined"
          color="primary"
          startDecorator={<LayersIcon size={18} />}
          onClick={handleModelVisualizationClick}
        >
          Visualize Model Architecture
        </Button>
      </Box>

      <Tabs
        aria-label="Model tabs"
        value={activeTab}
        onChange={(event, value) => setActiveTab(value)}
        sx={{ mt: 2, overflow: 'hidden' }}
      >
        <TabList>
          <Tab>Overview</Tab>
          <Tab>Adaptors</Tab>
          <Tab>Provenance</Tab>
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
          <Typography level="title-lg" marginBottom={2}>
            Model Configuration
          </Typography>
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

        {/* Adaptors Tab */}
        <TabPanel value={1} sx={{ p: 2 }}>
          <Typography level="title-lg" marginBottom={2}>
            Available Adaptors
          </Typography>
          <Stack
            direction="column"
            spacing={2}
            style={{ overflow: 'auto', maxHeight: '500px' }}
          >
            {peftData && peftData.length === 0 && (
              <Typography level="body-sm" color="neutral">
                No Adaptors available for this model. Train one!
              </Typography>
            )}
            {peftData &&
              peftData.map((peft) => (
                <Sheet
                  key={peft}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 'sm',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography level="title-md">{peft}</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant={adaptor === peft ? 'solid' : 'soft'}
                      color="primary"
                      onClick={() => {
                        setAdaptor(peft);
                      }}
                    >
                      {adaptor === peft ? 'Selected' : 'Select'}
                    </Button>
                    <IconButton
                      variant="plain"
                      color="danger"
                      onClick={() => {
                        confirm(
                          'Are you sure you want to delete this adaptor?',
                        ) &&
                          fetch(
                            chatAPI.Endpoints.Models.DeletePeft(
                              experimentInfo?.config?.foundation,
                              peft,
                            ),
                          ).then(() => {
                            peftMutate();
                          });
                      }}
                    >
                      <Trash2Icon />
                    </IconButton>
                  </Box>
                </Sheet>
              ))}
          </Stack>
        </TabPanel>

        {/* Provenance Tab */}
        <TabPanel value={2} sx={{ p: 2, height: '100%' }}>
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
              <Typography level="title-lg">Model Provenance</Typography>
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
      </Tabs>
    </Sheet>
  );
}
