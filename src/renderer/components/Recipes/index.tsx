/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { Button, Grid, ModalClose, Typography } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipeCard from './RecipeCard';
import NewExperimentModal from './NewExperimentModal';
import { useState } from 'react';

// Create a fake recipe details array with Title, Description:
const recipeDetails = [
  {
    id: 1,
    title: 'Train a Model From Scratch',
    description:
      'Build a new machine learning model from the ground up using Nanotron. Ideal for custom use cases and datasets.',
  },
  {
    id: 2,
    title: 'Fine-tune an Existing Model',
    description:
      'Adapt a pre-trained model to your specific needs using LoRA. Save time and resources by leveraging existing knowledge.',
  },
  {
    id: 3,
    title: 'Evaluate a Model',
    description:
      'Assess the performance of your model using Eleuther Labs AI Evaluation Harness. Gain insights into accuracy and reliability.',
  },
  {
    id: 4,
    title: 'Convert a Model to the MLX Format',
    description:
      'Transform your model into the MLX format for compatibility with various deployment environments.',
  },
  {
    id: 5,
    title: 'Quantize a Model',
    description:
      'Optimize your model for faster inference and reduced size using Nanotron’s quantization tools.',
  },
];

export default function RecipesModal({
  modalOpen,
  setModalOpen,
  createNewExperiment,
}) {
  const [newExperimentModalOpen, setNewExperimentModalOpen] = useState(false);

  return (
    <>
      <NewExperimentModal
        modalOpen={newExperimentModalOpen}
        setModalOpen={setNewExperimentModalOpen}
        createNewExperiment={createNewExperiment}
      />
      <Modal open={modalOpen}>
        <ModalDialog
          sx={{
            top: '5vh', // Sit 20% from the top of the screen
            margin: 'auto',
            transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
            width: '80vw',
            // maxWidth: '700px',
            height: '90vh',
          }}
        >
          <ModalClose onClick={() => setModalOpen(false)} />
          <Typography level="h2" mb={2}>
            👋 Welcome to Transformer Lab! What do you want to do?
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{
              flexGrow: 1,
              justifyContent: 'center',
              alignContent: 'flex-start',
              overflow: 'auto',
            }}
          >
            <Grid key={0}>
              <RecipeCard
                recipeDetails={{
                  title: 'Create a Blank Experiment',
                  description: '',
                }}
                actionOveride={() => {
                  setModalOpen(false);
                  setNewExperimentModalOpen(true);
                }}
              />
            </Grid>
            {recipeDetails.map((recipe) => (
              <Grid key={recipe.id}>
                <RecipeCard recipeDetails={recipe} />
              </Grid>
            ))}
          </Grid>
        </ModalDialog>
      </Modal>
    </>
  );
}
