import { DialogContent, DialogTitle, Modal, ModalDialog } from '@mui/joy';
import { useEffect, useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function ResultsModal({
  open,
  setOpen,
  experimentId,
  evaluator,
}) {
  const [resultText, setResultText] = useState('');
  useEffect(() => {
    if (open && experimentId && evaluator) {
      const output_file = 'scripts/evals/' + evaluator + '/output.txt';
      fetch(
        chatAPI.Endpoints.Experiment.GetFile(experimentId, output_file)
      ).then((res) => {
        res.json().then((text) => {
          setResultText(text);
        });
      });
    }
  });

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog
        sx={{
          width: '70vw',
          maxHeight: '80vh',
        }}
      >
        <DialogTitle>Results from: {evaluator}</DialogTitle>
        <DialogContent
          sx={{ backgroundColor: '#222', color: '#ddd', padding: 2 }}
        >
          <pre>{resultText}</pre>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
