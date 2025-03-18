/* eslint-disable jsx-a11y/anchor-is-valid */

import {
  Typography,
  Sheet,
  Button,
  Box,
} from '@mui/joy';

import { useLocation, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import LocalModelsTable from 'renderer/components/ModelZoo/LocalModelsTable';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function SelectEmbeddingModel({
  experimentInfo,
  setEmbedding = (model) => {},
}) {
  const location = useLocation();
  const navigate = useNavigate();

  // Fetch available models - using embedding=true parameter to get embedding models
  const { data: models, error, isLoading, mutate } = useSWR(
    `${chatAPI.Endpoints.Models.LocalList()}?embedding=true`,
    fetcher
  );

  const handleSelectModel = (model) => {
    let model_name = '';
    let model_filename = '';
    let model_architecture = '';

    if (model) {
      model_name = model.model_id;

      // Set model_filename based on where it's stored
      if (model.stored_in_filesystem) {
        model_filename = model.local_path;
      } else if (model.json_data?.model_filename) {
        model_filename = model.json_data.model_filename;
      }

      model_architecture = model.json_data?.architecture;
    }

    // Update the embedding model in the experiment config
    async function updateEmbeddingConfig() {
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model',
          model_name
        )
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model_filename',
          model_filename
        )
      );
      await fetch(
        chatAPI.GET_EXPERIMENT_UPDATE_CONFIG_URL(
          experimentInfo?.id,
          'embedding_model_architecture',
          model_architecture
        )
      );

      // Call the parent's setEmbedding function
      setEmbedding(model);

      // Navigate back to previous page
      navigate(-1);
    }

    updateEmbeddingConfig();
  };

  const handleBackClick = () => {
    navigate(-1);
  };

  return (
    <Sheet sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography level="h1">Select Embedding Model</Typography>
        <Button onClick={handleBackClick} variant="outlined">Back</Button>
      </Box>

      {isLoading ? (
        <Typography>Loading models...</Typography>
      ) : error ? (
        <Typography color="danger">Error loading models</Typography>
      ) : (
        <LocalModelsTable
          models={models}
          mutateModels={mutate}
          setEmbedding={handleSelectModel}
          pickAModelMode
          isEmbeddingMode={true}
        />
      )}
    </Sheet>
  );
}
