import React, { useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import {
  Dashboard,
  DashboardModal,
  DragDrop,
  ProgressBar,
  StatusBar,
} from '@uppy/react';
import XHR from '@uppy/xhr-upload';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const uppy = new Uppy().use(XHR, {
  endpoint: '',
});

// uppy.on('complete', () => {
//   console.log('Modal is open');
// });

export default function DatasetDetailsModal({ open, setOpen }) {
  const [newDatasetName, setNewDatasetName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Reset newDatasetName when the modal is open/closed
  // useEffect(() => {
  //   setNewDatasetName('');
  // }, [open]);

  uppy?.getPlugin('XHRUpload')?.setOptions({
    endpoint: chatAPI.Endpoints.Dataset.FileUpload(newDatasetName),
    getResponseError: function getResponseError(responseText, response) {
      try {
        alert(JSON.parse(responseText)?.detail);
      } catch (e) {
        return responseText;
      }
    },
  });

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="h5">{newDatasetName || 'New'} Dataset</Typography>
          <Divider sx={{ my: 2 }} />
          <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {newDatasetName === '' && (
              <form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
                onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const name =
                    event.currentTarget.elements['dataset-name']?.value;

                  const response = await fetch(
                    chatAPI.Endpoints.Dataset.Create(name)
                  );
                  const data = await response.json();
                  if (data.status == 'error') {
                    alert(data.message);
                  } else {
                    // Use the returned dataset_id because it has been sanitized
                    setNewDatasetName(data.dataset_id);
                    setShowUploadDialog(true);
                    setOpen(false);
                  }
                }}
              >
                <Input placeholder="Dataset Name" name="dataset-name" />
                <Button type="submit">Create</Button>
              </form>
            )}
          </Sheet>
        </ModalDialog>
      </Modal>
      <DashboardModal
        uppy={uppy}
        open={showUploadDialog}
        onRequestClose={() => {
          uppy.cancelAll();
          setNewDatasetName('');
          setShowUploadDialog(false);
        }}
        locale={{
          strings: {
            dropPasteFiles:
              "Drop dataset files here or %{browseFiles}. You must name one file '<name>_train.jsonl' and the second one '<name>_eval.jsonl' where <name> is EXACTLY the dataset name. Files should be in JSONL format, with one JSON object per line.",
          },
        }}
        closeAfterFinish
        // doneButtonHandler={() => {
        //   uppy.cancelAll();
        //   setShowUploadDialog(false);
        // }}
        proudlyDisplayPoweredByUppy={false}
        note="Learn more about JSONL here: https://jsonlines.org/ Don't worry we will support more file types soon :)"
      />
    </>
  );
}
