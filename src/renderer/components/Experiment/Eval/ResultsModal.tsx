import { DialogContent, DialogTitle, Modal, ModalDialog } from '@mui/joy';
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
      alert(
        'I have broken this temporarily -- need to open the output.txt file in a different place'
      );
      fetch(
        chatAPI.Endpoints.Experiment.GetFile(experimentInfo?.id, output_file)
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
