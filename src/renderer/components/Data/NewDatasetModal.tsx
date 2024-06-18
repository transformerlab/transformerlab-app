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

import * as chatAPI from '../../lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function DatasetDetailsModal({ open, setOpen }) {
  const [newDatasetName, setNewDatasetName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [trainFileUploaded, setTrainFileUploaded] = useState(false);
  const [evalFileUploaded, setEvalFileUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(new FormData());

  // Reset newDatasetName when the modal is open/closed
  // useEffect(() => {
  //   setNewDatasetName('');
  // }, [open]);
  const { data, isLoading } = useSWR(
    chatAPI.Endpoints.Dataset.LocalList(),
    fetcher
  );
  //Resetting state variables
  const handleClose = () => {
    setOpen(false);
    setShowUploadDialog(false);
    setNewDatasetName('');
    setEvalFileUploaded(false);
    setTrainFileUploaded(false);
    setFormData(new FormData());
  };

  useEffect(() => {
    //This needs to be in a useEffect because we need to wait for state variables to update
    if (trainFileUploaded && evalFileUploaded) {
      uploadFiles();
    }
  }, [trainFileUploaded, evalFileUploaded]);
  const uploadFiles = async () => {
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
          <Typography level="h5">Upload Dataset</Typography>
          <Divider sx={{ my: 2 }} />
          <Box //Making the modal a set size
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              overflowY: 'hidden',
              width: '25vw',
              justifyContent: 'center',
            }}
          >
            {!trainFileUploaded &&
              !evalFileUploaded &&
              `Add dataset files here. You must name one file '${newDatasetName}_train.jsonl'
              and the second one '${newDatasetName}_eval.jsonl'. Files should be in JSONL
              format, with one JSON object per line.`}
            {trainFileUploaded &&
              !evalFileUploaded &&
              `Please upload the eval file, named '${newDatasetName}_eval.jsonl'`}
            {!trainFileUploaded &&
              evalFileUploaded &&
              `Please upload the train file, named '${newDatasetName}_train.jsonl'`}
            <Button
              startDecorator={<PlusCircleIcon />}
              onClick={() => {
                var input = document.createElement('input');
                input.type = 'file';
                input.multiple = true; //Allow multiple files
                input.accept = '.jsonl'; //Only allow JSONL files
                input.onchange = async (e) => {
                  let files = Array.from(input.files);
                  console.log(files);
                  for (const file of files) {
                    //Only appending the files with the correct names
                    //Preventing the user from uploading the same file twice
                    if (
                      !trainFileUploaded &&
                      file.name === `${newDatasetName}_train.jsonl`
                    ) {
                      formData.append('files', file); //Have to append to files attribute since there are multiple files
                      setTrainFileUploaded(true);
                    } else if (
                      !evalFileUploaded &&
                      file.name === `${newDatasetName}_eval.jsonl`
                    ) {
                      formData.append('files', file);
                      setEvalFileUploaded(true);
                    } else {
                      alert(
                        `Error: Please upload files with the name '${newDatasetName}_train.jsonl' and '${newDatasetName}_eval.jsonl'`
                      );
                    }
                  }
                };
                input.click();
              }}
              disabled={uploading}
            >
              {uploading ? <CircularProgress /> : 'Add files'}
            </Button>
            <Typography level="caption">{`Learn more about JSONL here: https://jsonlines.org/ Don't worry we will support more file types soon :)`}</Typography>
            <Typography level="body-xs" color="neutral">
              Allowed filetypes: .jsonl
            </Typography>
          </Box>
        </ModalDialog>
      </Modal>
    </>
  );
}
