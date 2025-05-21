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
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);

  const selectedRecipe = recipeDetails.find(
    (recipe) => recipe.id === selectedRecipeId,
  );

  return (
    <Modal open={modalOpen}>
      <ModalDialog
        sx={{
          top: '3vh', // Sit 20% from the top of the screen
          margin: 'auto',
          transform: 'translateX(-50%)', // This undoes the default translateY that centers vertically
          width: '85vw',
          // maxWidth: '700px',
          height: '97vh',
        }}
      >
        <ModalClose onClick={() => setModalOpen(false)} />
        {selectedRecipeId ? (
          <SelectedRecipe
            recipe={selectedRecipe}
            setSelectedRecipeId={setSelectedRecipeId}
          />
        ) : (
          <ListRecipes
            recipeDetails={recipeDetails}
            setSelectedRecipe={setSelectedRecipeId}
          />
        )}
      </ModalDialog>
    </Modal>
  );
}
