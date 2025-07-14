import React, { useEffect, useState } from 'react';
import {
  DialogTitle,
  Modal,
  ModalDialog,
  Typography,
  Button,
  List,
  ListItem,
  ListItemDecorator,
  Chip,
  IconButton,
} from '@mui/joy';
import { DownloadIcon, TrashIcon, X } from 'lucide-react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';

export default function ControlNetModal({
  open,
  onClose,
  selectedControlnet,
  onSelect,
}) {
  const [controlNets, setControlNets] = useState<string[]>([]);

  const refresh = async () => {
    try {
      const response = await fetch(
        getAPIFullPath('diffusion', ['listControlnets'], {}),
      );
      const models = await response.json();
      const names = (models.controlnets || []).map(
        (m) => m.model_id || m.name || m.id || '',
      );

      setControlNets(names);
    } catch (e) {
      console.error('❌ Failed to fetch controlnets:', e);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const handleDelete = async (id: string) => {
    await fetch(chatAPI.Endpoints.Models.Delete(id, true));
    if (selectedControlnet === id) onSelect('off');
    refresh();
  };

  const handleSelect = (id: string) => {
    onSelect(id === selectedControlnet ? 'off' : id);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Manage ControlNets
          <IconButton onClick={onClose}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        {controlNets.length > 0 ? (
          <List
            size="sm"
            sx={{
              mt: 2,
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            {controlNets.map((id) => (
              <ListItem
                key={id}
                variant={selectedControlnet === id ? 'soft' : 'plain'}
                endAction={
                  <>
                    <Button
                      size="sm"
                      variant={selectedControlnet === id ? 'solid' : 'soft'}
                      onClick={() => handleSelect(id)}
                      sx={{ mr: 1 }}
                    >
                      {selectedControlnet === id ? 'Selected' : 'Select'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outlined"
                      color="danger"
                      onClick={() => handleDelete(id)}
                    >
                      <TrashIcon size={16} />
                    </Button>
                  </>
                }
              >
                <ListItemDecorator>
                  <DownloadIcon size={16} />
                </ListItemDecorator>
                {id}
                {selectedControlnet === id && (
                  <Chip size="sm" variant="soft" color="success" sx={{ ml: 1 }}>
                    Active
                  </Chip>
                )}
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography
            level="body-sm"
            sx={{ mt: 3, textAlign: 'center', px: 2 }}
          >
            No ControlNets available. You can install ControlNet models from the
            Model Store tab in the Model Zoo using the download bar at the
            bottom of the page there.
          </Typography>
        )}
      </ModalDialog>
    </Modal>
  );
}
