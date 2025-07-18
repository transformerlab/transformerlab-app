/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { CircularProgress, ModalClose, Typography } from '@mui/joy';
import { useState } from 'react';
import ListRecipes from './ListRecipes';
import SelectedRecipe from './SelectedRecipe';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';

export default function RecipesModal({
  modalOpen,
  setModalOpen,
  createNewExperiment,
  showRecentExperiments = true,
}) {
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isCreatingLoadingState, setIsCreatingLoadingState] = useState(false);

  const handleClose = () => {
    setModalOpen(false);
    setSelectedRecipe(null);
  };

  const handleCreateNewExperiment = async (recipeId, experimentName) => {
    if (recipeId === -1) {
      // This means user clicked on Create BLANK experiment
      await createNewExperiment(experimentName);
    } else {
      setIsCreatingLoadingState(true);
      await createNewExperiment(experimentName, recipeId);
      setIsCreatingLoadingState(false);
    }
    handleClose();
  };

  return (
    <Modal open={modalOpen}>
      <ModalDialog
        sx={{
          margin: 'auto',
          overflow: 'hidden',
          width: '94%',
          height: '94%',
        }}
      >
        <ModalClose onClick={() => handleClose()} />
        {isCreatingLoadingState && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              flexDirection: 'column',
            }}
          >
            <Typography level="body-lg" sx={{ mb: 2 }}>
              Setting up new experiment...
            </Typography>
            <CircularProgress />
          </div>
        )}
        {!isCreatingLoadingState &&
          (selectedRecipe ? (
            <SelectedRecipe
              recipe={selectedRecipe}
              setSelectedRecipeId={setSelectedRecipe}
              installRecipe={handleCreateNewExperiment}
            />
          ) : (
            <ListRecipes
              setSelectedRecipe={setSelectedRecipe}
              close={handleClose}
              showRecentExperiments={showRecentExperiments}
            />
          ))}
      </ModalDialog>
    </Modal>
  );
}
