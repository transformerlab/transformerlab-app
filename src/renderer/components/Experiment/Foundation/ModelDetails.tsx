import {
  Box,
  Button,
  Divider,
  IconButton,
  Link,
  Stack,
  Table,
  Typography,
  Modal,
  ModalDialog,
  FormLabel,
  Input,
  FormHelperText,
  DialogContent,
  CircularProgress,
  DialogTitle,
  AspectRatio,
  Skeleton,
} from '@mui/joy';
import useSWR from 'swr';

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

import placeholderLogo from 'renderer/img/attention.png';
import { FaEject } from 'react-icons/fa6';

function modelNameIsInHuggingfaceFormat(modelName: string) {
  return modelName.includes('/');
}
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ModelDetails({
  experimentInfo,
  adaptor,
  setFoundation,
  setAdaptor,
  setLogsDrawerOpen = null,
}) {
  const [huggingfaceNewModelName, setHuggingfaceNewModelName] = useState('');
  const [huggingfaceOrganizationName, setHuggingfaceOrganizationName] =
    useState('');
  const [huggingfaceModelCardData, setHuggingfaceModelCardData] = useState({});
  const [huggingfaceUploadDialog, setHuggingfaceUploadDialog] = useState(false);
  const [isUploadLoading, setIsUploadLoading] = useState(false);
  const [isEjecting, setIsEjecting] = useState(false);
  const [modelDetailsData, setModelDetailsData] = useState({ logo: 'loading' });
  const { models, isError, isLoading, mutate } = useModelStatus();

  const huggingfaceId = experimentInfo?.config?.foundation;
  const handleSubmit = async () => {
    if (!/^[a-zA-Z0-9-]+$/.test(huggingfaceNewModelName)) {
      //If the name is not in the correct format (letters, numbers, hyphens)
      alert(
        'Invalid model name. Please only use letters, numbers, and hyphens.',
      );
      setHuggingfaceNewModelName('');
      return;
    }
    setIsUploadLoading(true); //For the loading spinner
    try {
      const response = await fetch(
        chatAPI.Endpoints.Models.UploadModelToHuggingFace(
          huggingfaceId,
          huggingfaceNewModelName,
          huggingfaceOrganizationName,
          huggingfaceModelCardData,
        ),
      );

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        alert('Model uploaded successfully.');
      } else {
        alert(data.message || 'An error occurred during upload.');
      }
    } catch (error) {
      console.error('Error uploading model:', error);
      alert('An error occurred during upload.');
    }
    setHuggingfaceNewModelName('');
    setHuggingfaceUploadDialog(false);
    setIsUploadLoading(false);
    setHuggingfaceModelCardData({});
    setHuggingfaceOrganizationName('');
  };

  useMemo(() => {
    // This is a local model
    if (experimentInfo?.config?.foundation_filename) {
      // TODO: Load in model details from the filesystem
      fetch(chatAPI.Endpoints.Models.ModelDetailsFromFilesystem(huggingfaceId))
        .then((res) => res.json())
        .then((data) => setModelDetailsData(data))
        .catch((error) => console.log(error));

      // Try to see if this is a HuggingFace model
    } else if (huggingfaceId && modelNameIsInHuggingfaceFormat(huggingfaceId)) {
      fetch(chatAPI.Endpoints.Models.GetLocalHFConfig(huggingfaceId))
        .then((res) => res.json())
        .catch((error) => console.log(error));

      fetch(chatAPI.Endpoints.Models.ModelDetailsFromGallery(huggingfaceId))
        .then((res) => res.json())
        .then((data) => {
          setModelDetailsData(data);
        });
    } else {
      setModelDetailsData({});
    }
  }, [experimentInfo]);

  return (
    <>
      <Stack
        direction="row"
        sx={{ minHeight: '100px', overflow: 'hidden', mx: 2 }}
      >
        <AspectRatio
          variant="plain"
          ratio="4/4"
          sx={{
            width: 250,
            pr: 2,
            borderRadius: 'md',
            display: { xs: 'none', sm: 'none', md: 'block' }, // Hide on small screens
          }}
          objectFit="cover"
        >
          <Skeleton loading={modelDetailsData?.logo == 'loading'}>
            <img
              src={
                modelDetailsData?.logo == 'loading'
                  ? placeholderLogo
                  : modelDetailsData?.logo
                    ? modelDetailsData?.logo
                    : placeholderLogo
              }
              alt=""
              style={{}}
            />
          </Skeleton>
        </AspectRatio>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Box
            display="flex"
            flexDirection="column"
            sx={{ overflow: 'hidden', mb: 1 }}
          >
            <Typography level="h3">
              {experimentInfo?.config?.foundation}
            </Typography>
            <Typography level="title-md">
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
            <Stack direction="row" gap={1} marginTop={0}>
              <Link
                href={modelDetailsData?.resources?.canonicalUrl}
                target="_blank"
                endDecorator={<ExternalLinkIcon size="12px" />}
              >
                <Typography level="body-sm">
                  {modelDetailsData?.author?.name}
                </Typography>
              </Link>
            </Stack>
            <Typography
              level="body-sm"
              paddingTop={1}
              sx={{
                textOverflow: 'ellipsis',
                overflow: 'auto',
                flexShrink: 1,
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
            flexShrink={0}
            flex={1}
          >
            <RunModelButton
              experimentInfo={experimentInfo}
              killWorker={killWorker}
              models={models}
              mutate={mutate}
              setLogsDrawerOpen={setLogsDrawerOpen}
            />
            {experimentInfo?.config?.foundation_filename !== '' && (
              <Button
                variant="soft"
                onClick={() => {
                  setHuggingfaceUploadDialog(true);
                }}
                disabled={isUploadLoading}
                endDecorator={isUploadLoading ? <CircularProgress /> : null}
              >
                Upload to HF
              </Button>
            )}
            <Button
              startDecorator={
                isEjecting ? <CircularProgress size="sm" /> : <FaEject />
              }
              onClick={async () => {
                setIsEjecting(true);
                try {
                  // Clear all foundation-related fields in the backend using bulk update
                  await fetch(
                    chatAPI.Endpoints.Experiment.UpdateConfigs(
                      experimentInfo?.id,
                    ),
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        foundation: '',
                        foundation_filename: '',
                        foundation_model_architecture: '',
                        inferenceParams: '{}',
                      }),
                    },
                  );

                  // Update local state after successful API calls
                  setFoundation(null);
                  // setAdaptor(''); // setFoundation already clears adaptor
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error('Error ejecting model:', error);
                } finally {
                  setIsEjecting(false);
                  mutate();
                }
              }}
              color="danger"
              variant="outlined"
              disabled={models?.length > 0 || isEjecting}
            >
              <Box sx={{ display: { xs: 'none', sm: 'none', md: 'block' } }}>
                {isEjecting ? 'Ejecting...' : 'Eject Model'}
              </Box>
            </Button>
            {/* <Button startDecorator={<SquareIcon />}>Stop</Button> */}
          </Stack>
        </Box>
      </Stack>
      <Divider sx={{ marginTop: 1 }} />
      <Modal
        open={huggingfaceUploadDialog}
        onClose={() => {
          setHuggingfaceUploadDialog(false);
          setHuggingfaceNewModelName('');
          setHuggingfaceUploadDialog(false);
          setHuggingfaceModelCardData({});
          setHuggingfaceOrganizationName('');
        }}
      >
        <ModalDialog>
          <DialogContent>
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                maxWidth: '500px',
                overflow: 'hidden',
                marginBottom: '10px',
                gap: '8px',
              }}
            >
              <DialogTitle>Upload to Hugging Face</DialogTitle>
              <FormLabel>Please input a name for your new model.</FormLabel>
              <Input
                placeholder="transformerlab-model"
                required
                onChange={(e) => {
                  setHuggingfaceNewModelName(e.target.value);
                }}
              />
              <FormHelperText>
                You do not need to include your username or organization name.{' '}
                <br />
                Your name can only contain letters, numbers and hyphens.
              </FormHelperText>
              <FormLabel>
                Please input an organization name for your model.
              </FormLabel>
              <Input
                placeholder="transformerlab"
                onChange={(e) => {
                  setHuggingfaceOrganizationName(e.target.value);
                }}
              ></Input>
              <FormHelperText>
                If you do not include an organization name, your model will be
                created under your namespace.
              </FormHelperText>
              <h3>Model Card</h3>
              <FormLabel>License</FormLabel>
              <Input
                placeholder="MIT"
                onChange={(e) => {
                  setHuggingfaceModelCardData((prevData) => ({
                    ...prevData,
                    license: e.target.value,
                  }));
                }}
              />
              <FormLabel>Language</FormLabel>
              <Input
                placeholder="English"
                onChange={(e) => {
                  setHuggingfaceModelCardData((prevData) => ({
                    ...prevData,
                    language: e.target.value,
                  }));
                }}
              />
              <FormLabel>Library Name</FormLabel>
              <Input
                placeholder="transformerlab"
                onChange={(e) => {
                  setHuggingfaceModelCardData((prevData) => ({
                    ...prevData,
                    library: e.target.value,
                  }));
                }}
              />
            </Box>

            <Button
              endDecorator={isUploadLoading ? <CircularProgress /> : null}
              onClick={handleSubmit}
            >
              Submit
            </Button>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </>
  );
}
