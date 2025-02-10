import React, { useEffect, useState } from 'react';
import useSWR from 'swr';

import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  Box,
  CircularProgress,
} from '@mui/joy';
import { PlusCircleIcon } from 'lucide-react';
import Dropzone from 'react-dropzone';
import { IoCloudUploadOutline } from 'react-icons/io5';

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetDetailsModal({ open, setOpen }) {
  const [newDatasetName, setNewDatasetName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [trainFileUploaded, setTrainFileUploaded] = useState(false);
  const [evalFileUploaded, setEvalFileUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = React.useState(false);

  // Reset newDatasetName when the modal is open/closed
  // useEffect(() => {
  //   setNewDatasetName('');
  // }, [open]);
  const { data, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.LocalList(false),
    fetcher
  );
  //Resetting state variables
  const handleClose = () => {
    setOpen(false);
    setShowUploadDialog(false);
    setNewDatasetName('');
    setEvalFileUploaded(false);
    setTrainFileUploaded(false);
    mutate();
  };

  const uploadFiles = async (formData) => {
    setUploading(true); //This is for the loading spinner
    //Create the dataset before uploading
    const response = await fetch(
      chatAPI.Endpoints.Dataset.Create(newDatasetName)
    );
    const data = await response.json();
    if (data.status == 'error') {
      alert(data.message);
    } else {
      fetch(chatAPI.Endpoints.Dataset.FileUpload(newDatasetName), {
        method: 'POST',
        body: formData,
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error('File upload failed');
          }
        })
        .then((data) => {
          console.log('Server response:', data);
        })
        .catch((error) => {
          console.error('Error uploading file:', error);
        });
    }
    setUploading(false);
    handleClose();
  };
  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          //Dont need to reset every variable here as these variables are only altered in the second modal
          setOpen(false);
          setShowUploadDialog(false);
          setNewDatasetName('');
        }}
      >
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">
            {newDatasetName || 'New'} Dataset
          </Typography>
          <Divider sx={{ my: 1 }} />
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
                  // Check if the dataset name already exists
                  // data is local list output
                  const datasetNames = data.map((item) => item.dataset_id);
                  if (datasetNames.includes(name)) {
                    alert('Dataset name already exists. Please try again.');
                    return;
                  } else {
                    setNewDatasetName(name);
                    setShowUploadDialog(true);
                    setOpen(false);
                  }
                }}
              >
                <Input
                  placeholder="Dataset Name"
                  name="dataset-name"
                  required //Making title a required field
                />
                <Button type="submit" disabled={isLoading}>
                  {/* Adding this to assume that data is loaded when the button is clicked */}{' '}
                  {isLoading ? <CircularProgress /> : 'Create'}
                </Button>
              </form>
            )}
          </Sheet>
        </ModalDialog>
      </Modal>
      <Modal open={showUploadDialog} onClose={handleClose}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-lg">Upload Dataset</Typography>
          <Divider sx={{ my: 2 }} />
          <Box //Making the modal a set size
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              overflowY: 'hidden',
              width: '25vw',
              justifyContent: 'center',
            }}
          >
            <Dropzone
              onDrop={async (acceptedFiles) => {
                setDropzoneActive(false);

                const formData = new FormData();
                for (const file of acceptedFiles) {
                  formData.append('files', file);
                }
                await uploadFiles(formData);
              }}
              onDragEnter={() => {
                setDropzoneActive(true);
              }}
              onDragLeave={() => {
                setDropzoneActive(false);
              }}
              noClick
            >
              {({ getRootProps, getInputProps }) => (
                <div id="dropzone_baby" {...getRootProps()}>
                  <Sheet
                    color="primary"
                    variant="soft"
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      marginBottom: '0rem',
                      overflow: 'hidden',
                      minHeight: '130px',
                      border: dropzoneActive
                        ? '2px solid var(--joy-palette-warning-400)'
                        : '2px dashed var(--joy-palette-neutral-300)',
                      borderRadius: '8px',
                      flex: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      color: 'var(--joy-palette-neutral-400)',
                    }}
                  >
                    <IoCloudUploadOutline size="36px" /> Drag files here
                    <Typography level="body-xs" color="neutral" mt={3}>
                      Allowed filetypes: .jsonl, .json
                    </Typography>
                  </Sheet>
                </div>
              )}
            </Dropzone>
            <Button
              startDecorator={<PlusCircleIcon />}
              onClick={() => {
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = true; //Allow multiple files

                // input.accept = '.jsonl'; //Only allow JSONL files
                input.onchange = async (e) => {
                  let files = Array.from(input.files);
                  console.log(files);
                  const formData = new FormData();
                  for (const file of files) {
                    formData.append('files', file);
                  }
                  await uploadFiles(formData);
                };
                input.click();
              }}
              disabled={uploading}
            >
              {uploading ? <CircularProgress /> : 'Add files'}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
}
