import {
  Box,
  Button,
  Divider,
  IconButton,
  Link,
  Stack,
  Table,
  Typography,
} from '@mui/joy';
import {
  DeleteIcon,
  ExternalLinkIcon,
  XCircleIcon,
  XSquareIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import RunModelButton from 'renderer/components/Experiment/Foundation/RunModelButton';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import {
  killWorker,
  useModelStatus,
} from 'renderer/lib/transformerlab-api-sdk';

const hf_config_translation = {
  architectures: 'Architecture',
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

export default function ModelDetails({
  experimentInfo,
  adaptor,
  setFoundation,
  setAdaptor,
}) {
  const [huggingfaceData, setHugggingfaceData] = useState({});
  const [modelDetailsData, setModelDetailsData] = useState({});
  const { models, isError, isLoading, mutate } = useModelStatus();

  const huggingfaceId = experimentInfo?.config?.foundation;

  useMemo(() => {
    if (huggingfaceId) {
      fetch(`https://huggingface.co/${huggingfaceId}/resolve/main/config.json`)
        .then((res) => res.json())
        .then((data) => setHugggingfaceData(data));

      fetch(chatAPI.Endpoints.Models.ModelDetailsFromGallery(huggingfaceId))
        .then((res) => res.json())
        .then((data) => {
          setModelDetailsData(data);
        });
    } else {
      setHugggingfaceData({});
      setModelDetailsData({});
    }
  }, [huggingfaceId]);

  return (
    <>
      <Stack direction="row" sx={{ minHeight: '300px' }}>
        <img
          src={modelDetailsData?.logo}
          alt=""
          style={{
            float: 'left',
            margin: '0px 40px 0px 0px',
            width: '300px',
            objectFit: 'contain',
            borderRadius: '20px',
          }}
        />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <Box>
            <Typography level="h1">
              {experimentInfo?.config?.foundation}
            </Typography>
            <Typography level="h3">
              <b>Adaptor:</b>&nbsp;
              {experimentInfo?.config?.foundation ? (
                <>
                  {adaptor}
                  <IconButton
                    variant="plain"
                    sx={{
                      color: 'neutral.300',
                    }}
                    size="sm"
                    onClick={() => {
                      setAdaptor('');
                    }}
                  >
                    <DeleteIcon size="18px" />
                  </IconButton>
                </>
              ) : (
                'None'
              )}
            </Typography>
            <Stack direction="row" gap={8} marginTop={1}>
              <Link
                href={modelDetailsData?.resources?.canonicalUrl}
                target="_blank"
                endDecorator={<ExternalLinkIcon size="16px" />}
              >
                <Typography level="title-md">
                  {modelDetailsData?.author?.name}
                </Typography>
              </Link>
              <Link
                href={modelDetailsData?.resources?.downloadUrl}
                target="_blank"
                endDecorator={<ExternalLinkIcon size="16px" />}
              >
                <Typography level="title-md">Model Details</Typography>
              </Link>
            </Stack>
            <Typography
              level="body-sm"
              paddingTop={2}
              sx={{
                maxHeight: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {modelDetailsData?.description}
            </Typography>
          </Box>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}
          >
            <RunModelButton
              experimentInfo={experimentInfo}
              killWorker={killWorker}
              models={models}
              mutate={mutate}
            />
            <Button
              startDecorator={<XSquareIcon />}
              onClick={() => {
                setFoundation(null);
                fetch(
                  chatAPI.Endpoints.Experiment.UpdateConfig(
                    experimentInfo?.id,
                    'inferenceParams',
                    JSON.stringify({
                      '8-bit': false,
                      'cpu-offload': false,
                      inferenceEngine: null,
                    })
                  )
                );
              }}
              color="danger"
              variant="outlined"
            >
              Eject Model
            </Button>
            {/* <Button startDecorator={<SquareIcon />}>Stop</Button> */}
          </Stack>
        </Box>
      </Stack>
      <Divider sx={{ marginTop: '30px' }} />
      <div>
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
        {/* <pre>{data && JSON.stringify(data, null, 2)}</pre> */}
        {/* {JSON.stringify(modelDetailsData, null, 2)} */}
      </div>
    </>
  );
}
