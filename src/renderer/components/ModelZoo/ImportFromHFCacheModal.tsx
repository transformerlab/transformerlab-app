import { 
    Button, 
    Modal, 
    ModalClose, 
    ModalDialog, 
    Typography
} from '@mui/joy';
  
export default function ImportFromHFCacheModal({ open, setOpen}) {
    return (
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
        <ModalClose />
        <Typography>This is a modal.</Typography>
        </ModalDialog>
      </Modal>
    )
}