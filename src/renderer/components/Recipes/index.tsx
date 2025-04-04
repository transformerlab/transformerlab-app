/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { Button, Grid, ModalClose, Typography } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipeCard from './RecipeCard';
import NewExperimentModal from './NewExperimentModal';
import { useState } from 'react';
import recipeDetails from './recipeDetails'; // Import the JSON

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
            height: '90vh',
            width: '100vw',
          }}
        >
          <ModalClose onClick={() => setModalOpen(false)} />
          <Typography level="h2">
            👋 Welcome to Transformer Lab! What do you want to do?
          </Typography>
          <Typography level="body-lg" mb={2}>
            Start a new experiment using one of the recipes below, or start from
            scratch.
          </Typography>
          <Grid
            container
            spacing={3}
            sx={{
              flexGrow: 1,
              justifyContent: 'center',
              alignContent: 'flex-start',
              overflow: 'auto',
              width: '100%',
            }}
          >
            <Grid key={0} xs={12} sm={6} md={4} lg={3}>
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
              <Grid key={recipe.id} xs={12} sm={6} md={4} lg={3}>
                <RecipeCard recipeDetails={recipe} />
              </Grid>
            ))}
          </Grid>
        </ModalDialog>
      </Modal>
    </>
  );
}
