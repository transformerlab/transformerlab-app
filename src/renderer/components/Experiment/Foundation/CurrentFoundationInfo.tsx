/* eslint-disable jsx-a11y/anchor-is-valid */

import Sheet from '@mui/joy/Sheet';

import { Box, Button, IconButton, Stack, Table, Typography } from '@mui/joy';
import Tooltip from '@mui/joy/Tooltip';
import { BabyIcon, DotIcon, Trash2Icon, XCircleIcon } from 'lucide-react';

import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ModelDetails from './ModelDetails';
import { useMemo, useState } from 'react';

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
    fetchWithPost
  );
  const [huggingfaceData, setHugggingfaceData] = useState({});
  const [showProvenance, setShowProvenance] = useState(false);
  const huggingfaceId = experimentInfo?.config?.foundation;

  // Fetch provenance data from your GET endpoint using chatAPI.Endpoints.Models.ModelProvenance()
  const { data: provenance, error: provenanceError } = useSWR(
    chatAPI.Endpoints.Models.ModelProvenance(huggingfaceId),
    fetcher
  );

  console.log('provenance', provenance);
  console.log('provenanceError', provenanceError);

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
      />
      <Stack direction="row" gap={2}>
        <Box flex={2}>
          <Table id="huggingface-model-config-info">
            <tbody>
              {Object.entries(huggingfaceData).map(
                (row) =>
                  hf_translate(row[0]) !== null && (
                    <tr key={row[0]}>
                      <td>{hf_translate(row[0])}</td>
                      <td>{JSON.stringify(row[1])}</td>
                    </tr>
                  )
              )}
            </tbody>
          </Table>
          {/* Model Provenance Collapsible */}
          <Box mt={4}>
            <Button
              variant="soft"
              onClick={() => setShowProvenance((prev) => !prev)}
            >
              Model Provenance {showProvenance ? '▲' : '▼'}
            </Button>
            {showProvenance && (
              <Box
                sx={{
                  mt: 2,
                  overflow: 'auto',
                  maxHeight: 400,
                  maxWidth: '100%',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              >
                {provenance ? (
                  <Table
                    id="model-provenance-table"
                    sx={{
                      tableLayout: 'auto',
                      minWidth: 600, // Ensure horizontal scroll if needed
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Job ID</th>
                        <th>Base Model</th>
                        <th>Dataset</th>
                        <th>Params</th>
                        <th>Output Model</th>
                        <th>Evals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provenance.provenance_chain.map((row) => (
                        <tr key={row.job_id}>
                          <td>{row.job_id}</td>
                          <td>{row.input_model}</td>
                          <td>{row.dataset}</td>
                          <td>
                            <pre>{JSON.stringify(row.parameters, null, 2)}</pre>
                          </td>
                          <td>{row.output_model}</td>
                          <td>
                            <Box>
                              {row.evals && row.evals.length > 0 ? (
                                row.evals.map((evalItem) => (
                                  <Tooltip
                                    key={evalItem.job_id}
                                    title={
                                      <pre style={{ margin: 0 }}>
                                        {JSON.stringify(evalItem, null, 2)}
                                      </pre>
                                    }
                                  >
                                    <Typography
                                      level="body2"
                                      sx={{ cursor: 'pointer', mb: 0.5 }}
                                    >
                                      {evalItem.job_id} -{' '}
                                      {evalItem.template_name ||
                                        evalItem.evaluator ||
                                        'Eval'}
                                    </Typography>
                                  </Tooltip>
                                ))
                              ) : (
                                <Typography level="body2">
                                  No Evals
                                </Typography>
                              )}
                            </Box>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : provenanceError ? (
                  <Typography>Error loading provenance</Typography>
                ) : (
                  <Typography>Loading Provenance...</Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
        <Box flex={1}>
          <Typography level="title-lg" marginTop={1} marginBottom={1}>
            <BabyIcon size="1rem" />
            &nbsp;Available Adaptors:
          </Typography>
          <Stack
            direction="column"
            spacing={1}
            style={{ overflow: 'auto', height: '100%' }}
          >
            {peftData &&
              peftData.length === 0 &&
              'No Adaptors available for this model. Train one!'}
            {peftData &&
              peftData.map((peft) => (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'left',
                    alignItems: 'center',
                  }}
                  key={peft}
                >
                  <Typography level="title-md" paddingRight={3}>
                    {peft}
                    &nbsp;&nbsp;
                  </Typography>
                  <Button
                    variant="soft"
                    onClick={() => {
                      setAdaptor(peft);
                    }}
                  >
                    Select
                  </Button>
                  <IconButton
                    variant="plain"
                    onClick={() => {
                      confirm(
                        'Are you sure you want to delete this adaptor?'
                      ) &&
                        fetch(
                          chatAPI.Endpoints.Models.DeletePeft(
                            experimentInfo?.config?.foundation,
                            peft
                          )
                        ).then(() => {
                          peftMutate();
                        });
                    }}
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
              ))}
          </Stack>
        </Box>
      </Stack>
    </Sheet>
  );
}
