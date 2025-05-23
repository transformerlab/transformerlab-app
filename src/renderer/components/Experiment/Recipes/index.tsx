/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { ModalClose } from '@mui/joy';
import { useState } from 'react';
import ListRecipes from './ListRecipes';
import SelectedRecipe from './SelectedRecipe';
import { getFullPath } from 'renderer/lib/transformerlab-api-sdk';

export default function RecipesModal({
  modalOpen,
  setModalOpen,
  createNewExperiment,
}) {
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  const handleClose = () => {
    setModalOpen(false);
    setSelectedRecipe(null);
  };

  const handleCreateNewExperiment = async (recipe, experimentName) => {
    console.log('hi');
    console.log('recipe', recipe);
    console.log('experimentName', experimentName);
    if (recipe === -1) {
      // This means user clicked on Create BLANK experiment
      alert('Creating blank experiment');
      await createNewExperiment(experimentName);
    } else {
      await fetch(
        getFullPath('recipes', ['createExperiment'], {
          id: recipe.id,
          experiment_name: experimentName,
        }),
      );
    }
    handleClose();
  };

  return (
    <Modal open={modalOpen} onClose={() => handleClose()}>
      <ModalDialog
        sx={{
          top: '3vh', // Sit 20% from the top of the screen
          margin: 'auto',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          width: '85vw',
          // maxWidth: '700px',
          height: '93vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose onClick={() => handleClose()} />
        {selectedRecipe ? (
          <SelectedRecipe
            recipe={selectedRecipe}
            setSelectedRecipeId={setSelectedRecipe}
            installRecipe={handleCreateNewExperiment}
          />
        ) : (
          <ListRecipes setSelectedRecipe={setSelectedRecipe} />
        )}
      </ModalDialog>
    </Modal>
  );
}
