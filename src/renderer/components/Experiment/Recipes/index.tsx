/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { Button, ModalClose } from '@mui/joy';
import { useState } from 'react';
import recipeDetails from './recipeData.json'; // Import the JSON file with recipe details
import ListRecipes from './ListRecipes';
import SelectedRecipe from './SelectedRecipe';

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

  return (
    <Modal open={modalOpen} onClose={() => handleClose()}>
      <ModalDialog
        sx={{
          top: '3vh', // Sit 20% from the top of the screen
          margin: 'auto',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          width: '85vw',
          // maxWidth: '700px',
          height: '97vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose onClick={() => handleClose()} />
        {selectedRecipe ? (
          <SelectedRecipe
            recipe={selectedRecipe}
            setSelectedRecipeId={setSelectedRecipe}
          />
        ) : (
          <ListRecipes
            recipeDetails={recipeDetails}
            setSelectedRecipe={setSelectedRecipe}
          />
        )}
      </ModalDialog>
    </Modal>
  );
}
