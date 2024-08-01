import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  DialogContent,
  DialogTitle,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from '@mui/joy';
import { Type } from 'lucide-react';

export default function HelpVideoModal({ open, setOpen }) {
  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Current Foundation Model Details</DialogTitle>

        <DialogContent>
          Model Details
          <Typography level="h4">Help:</Typography>
          <Accordion>
            <AccordionSummary>
              <Typography>How to Load a Model</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>
                You are running Gemma. To load a new model, click on Foundation
                then click on Eject
              </Typography>
              <img
                src="https://image.mux.com/G7MNMQHOMAD6kTjsD2ksl4E1QYzUXVqHVA9EQaGKIjU/animated.gif?width=428&height=290"
                width="428"
                height="290"
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>
              <Typography>How to Change The Current Model</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>
                You are running Gemma. To load a new model, click on Foundation
                then click on Eject
              </Typography>
              <img
                src="https://image.mux.com/G7MNMQHOMAD6kTjsD2ksl4E1QYzUXVqHVA9EQaGKIjU/animated.gif?width=428&height=290"
                width="428"
                height="290"
              />
            </AccordionDetails>
          </Accordion>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
