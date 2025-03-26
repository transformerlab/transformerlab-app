/* eslint-disable jsx-a11y/anchor-is-valid */
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import { Button, Typography } from '@mui/joy';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import RecipeCard from './RecipeCard';

export default function LoginModal({ setExperimentId }) {
  async function createNewExperiment() {
    const name = 'alpha';
    const response = await fetch(chatAPI.CREATE_EXPERIMENT_URL(name));
    const newId = await response.json();
    setExperimentId(newId);
  }
  return (
    <Modal open={true}>
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
        <Typography level="h3">What do you want to do?</Typography>
        <RecipeCard />
        <Button
          onClick={() => {
            createNewExperiment();
          }}
        >
          Start from a blank experiment
        </Button>
      </ModalDialog>
    </Modal>
  );
}
