import {
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
} from '@mui/joy';
import { useEffect, useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function ResultsModal({
  open,
  setOpen,
  experimentInfo,
  plugin,
  evaluator,
}) {
  const [resultText, setResultText] = useState('');
  useEffect(() => {
    if (open && experimentInfo && evaluator) {
      const output_file = `plugins/${plugin}/output.txt`;
      console.log('Fetching results from', output_file);

      fetch(
        chatAPI.Endpoints.Experiment.GetEvalOutput(
          experimentInfo?.id,
          evaluator
        )
      ).then((res) => {
        if (res.ok) {
          res.text().then((text) => {
            setResultText(text);
          });
        } else {
          setResultText('No results found');
        }
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
        <ModalClose />
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
