import {
  Button,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Stack,
  Textarea,
} from '@mui/joy';
import { useState } from 'react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import useSWR from 'swr';
import { node } from 'webpack';

const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function NewNodeModal({ open, onClose, selectedWorkflow }) {
  const [mode, setMode] = useState('OTHER');

  console.log(mode);

  const {
    data: trainingTemplatesData,
    error: trainingTemplatesError,
    isLoading: isLoading,
  } = useSWR(chatAPI.GET_TRAINING_TEMPLATE_URL(), fetcher);

  const {
    data: workflowsData,
    error: workflowsError,
    isLoading: workflowsIsLoading,
  } = useSWR(chatAPI.Endpoints.Workflows.List(), fetcher);

  console.log(trainingTemplatesData);

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(event.target.outerText);
  };

  return (
    <Modal open={open} onClose={() => onClose()}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>Create new Node</DialogTitle>
        <DialogContent>text</DialogContent>
        <form
          onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = formData.get('name') as string;
            if (mode == 'TRAIN') {
              const template = formData.get('trainingTemplate') as string;
              const config = JSON.parse(selectedWorkflow.config);
              console.log(config);
              const node = {
                name: name,
                type: 'TRAIN',
                out: (config.nodes.length + 1).toString(),
                template: template,
              };
              await fetch(
                chatAPI.Endpoints.Workflows.AddNode(
                  selectedWorkflow.id,
                  JSON.stringify(node)
                )
              );
            } else {
              const node = JSON.parse(formData.get('node') as string);
              node.name = name;
              await fetch(
                chatAPI.Endpoints.Workflows.AddNode(
                  selectedWorkflow.id,
                  JSON.stringify(node)
                )
              );
            }
            onClose();
          }}
        >
          <Stack spacing={2}>
            <Select
              labelId="mode-label"
              id="mode-select"
              value={mode}
              onChange={handleModeChange}
            >
              <Option value="OTHER">OTHER</Option>
              <Option value="TRAIN">TRAIN</Option>
            </Select>
            <FormLabel>Name</FormLabel>
            <Textarea minRows={4} autoFocus required name="name" />
            {mode == 'TRAIN' ? (
              <Select name="trainingTemplate">
                {trainingTemplatesData.map((template) => (
                  <Option value={template[1]}>{template[1]}</Option>
                ))}
              </Select>
            ) : (
              <FormControl>
                <FormLabel>Nodes</FormLabel>
                <Textarea minRows={4} autoFocus required name="node" />
              </FormControl>
            )}
            <Button type="submit">Submit</Button>
          </Stack>
        </form>
      </ModalDialog>
    </Modal>
  );
}
