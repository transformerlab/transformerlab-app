/* eslint-disable no-nested-ternary */
import {
  Box,
  Button,
  Divider,
  Dropdown,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Menu,
  MenuButton,
  MenuItem,
  Sheet,
  Typography,
} from '@mui/joy';

import '@xyflow/react/dist/style.css';
import {
  AxeIcon,
  BookOpenIcon,
  BracesIcon,
  EllipsisIcon,
  PenIcon,
  PencilIcon,
  PlayIcon,
  PlusCircleIcon,
  Trash2Icon,
  WorkflowIcon,
} from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { Editor } from '@monaco-editor/react';

import * as chatAPI from '../../../../lib/transformerlab-api-sdk';
import useSWR from 'swr';
import NewWorkflowModal from './NewWorkflowModal';
import NewNodeModal from './NewNodeModal';
import WorkflowCanvas from './WorkflowCanvas';
import { useNotification } from '../../../Shared/NotificationSystem';
import fairyflossTheme from '../../../Shared/fairyfloss.tmTheme.js';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);
  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

function ShowCode({
  code,
  experimentInfo,
  mutateWorkflows,
}: {
  code: any;
  experimentInfo: any;
  mutateWorkflows: any;
}) {
  const editorRef = useRef<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Set up the editor with the current config JSON
  useEffect(() => {
    if (editorRef.current && code?.config) {
      try {
        const parsedConfig = JSON.parse(code.config);
        const formattedJson = JSON.stringify(parsedConfig, null, 2);
        editorRef.current.setValue(formattedJson);
      } catch (e) {
        editorRef.current.setValue(code.config || '{}');
      }
    }
  }, [code?.config, isEditing]);

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor;
    if (code?.config) {
      try {
        const parsedConfig = JSON.parse(code.config);
        const formattedJson = JSON.stringify(parsedConfig, null, 2);
        editor.setValue(formattedJson);
      } catch (e) {
        editor.setValue(code.config || '{}');
      }
    }
    setTheme(editor, monaco);
  }

  async function saveValue() {
    const value = editorRef.current?.getValue();

    try {
      // Parse the JSON to validate and convert to object
      const configObject = JSON.parse(value);

      // Use the new direct config update endpoint
      const response = await fetch(
        chatAPI.Endpoints.Workflows.UpdateConfig(code.id, experimentInfo.id),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(configObject),
        },
      );

      if (response.ok) {
        mutateWorkflows();
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
    }
  }

  const config = code?.config;

  if (!config) {
    return <></>;
  }

  let parsedConfig = {};
  try {
    parsedConfig = JSON.parse(config);
  } catch (e) {}

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {!isEditing && (
        <Box
          sx={{
            width: '100%',
            backgroundColor: 'background.level1',
            overflow: 'auto',
            flexGrow: 1,
            p: 4,
          }}
        >
          <pre>{JSON.stringify(parsedConfig, null, 2)}</pre>
        </Box>
      )}
      {isEditing && (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexGrow: 1,
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundColor: '#ddd',
              flexGrow: 1,
            }}
          >
            <Editor
              defaultLanguage="json"
              theme="my-theme"
              height="100%"
              width="100%"
              options={{
                minimap: {
                  enabled: false,
                },
                fontSize: 14,
                cursorStyle: 'block',
                wordWrap: 'on',
              }}
              onMount={handleEditorDidMount}
            />
          </Box>
        </Box>
      )}
      <Box
        display="flex"
        flexDirection="row"
        gap={1}
        sx={{
          width: '100%',
          justifyContent: 'flex-end',
          alignContent: 'center',
          p: 2,
          flexShrink: 0,
        }}
      >
        {isEditing ? (
          <>
            <Button
              onClick={() => {
                saveValue();
              }}
              color="success"
            >
              Save
            </Button>
            <Button
              variant="plain"
              color="danger"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            onClick={() => {
              setIsEditing(true);
            }}
            color="primary"
            variant="solid"
            startDecorator={<PencilIcon size="18px" />}
          >
            Edit
          </Button>
        )}
      </Box>
    </Box>
  );
}

const fetcher = (url: any) => fetch(url).then((res) => res.json());

export default function WorkflowList({ experimentInfo }) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [newWorkflowModalOpen, setNewWorkflowModalOpen] = useState(false);
  const [newNodeflowModalOpen, setNewNodeflowModalOpen] = useState(false);
  const [viewCodeMode, setViewCodeMode] = useState(false);
  const { addNotification } = useNotification();

  const {
    data: workflowsData,
    error: workflowsError,
    isLoading: isLoading,
    mutate: mutateWorkflows,
  } = useSWR(
    experimentInfo?.id
      ? chatAPI.Endpoints.Workflows.ListInExperiment(experimentInfo.id)
      : null,
    fetcher,
  );

  // select the first workflow available:
  useEffect(() => {
    if (workflowsData && workflowsData.length > 0) {
      if (selectedWorkflowId == null && !newWorkflowModalOpen) {
        setSelectedWorkflowId(workflowsData[0].id);
      }
    }
  }, [workflowsData, selectedWorkflowId, newWorkflowModalOpen]);

  const workflows = Array.isArray(workflowsData) ? workflowsData : [];

  const selectedWorkflow = workflows?.find(
    (workflow) => workflow.id === selectedWorkflowId,
  );

  async function runWorkflow(workflowId: string) {
    try {
      const response = await fetch(
        chatAPI.Endpoints.Workflows.RunWorkflow(workflowId, experimentInfo.id),
      );

      if (response.ok) {
        addNotification({
          type: 'success',
          message:
            'Your workflow has started! Navigate to the runs page to view its progress.',
        });
      } else {
        addNotification({
          type: 'danger',
          message: 'Failed to start workflow. Please try again.',
        });
      }
    } catch (error) {
      addNotification({
        type: 'danger',
        message: `Failed to start workflow with error: ${error}`,
      });
    }
  }
  return (
    <>
      <NewWorkflowModal
        open={newWorkflowModalOpen}
        onClose={() => {
          setNewWorkflowModalOpen(false);
          mutateWorkflows();
        }}
        selectedWorkflow={selectedWorkflow}
        experimentId={experimentInfo?.id}
      />
      {selectedWorkflow && (
        <NewNodeModal
          open={newNodeflowModalOpen}
          onClose={() => {
            setNewNodeflowModalOpen(false);
            mutateWorkflows();
          }}
          selectedWorkflow={selectedWorkflow}
          experimentInfo={experimentInfo}
        />
      )}
      <Box
        display="flex"
        flexDirection="row"
        width="100%"
        height="100%"
        gap={1}
      >
        <Box flex={1} display="flex" flexDirection="column">
          <Typography level="title-lg" mb={2}>
            Workflows
          </Typography>
          <List sx={{ overflowY: 'auto', height: '100%' }}>
            {workflows &&
              workflows?.length > 0 &&
              workflows?.map((workflow) => (
                <ListItem key={workflow.id}>
                  <ListItemButton
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    selected={selectedWorkflowId === workflow.id}
                  >
                    <ListItemDecorator>
                      <WorkflowIcon />
                    </ListItemDecorator>
                    <ListItemContent>{workflow.name}</ListItemContent>
                  </ListItemButton>
                </ListItem>
              ))}
            <ListItem>
              <ListItemButton
                sx={{ mt: 1 }}
                onClick={() => {
                  setSelectedWorkflowId(null);
                  setNewWorkflowModalOpen(true);
                }}
              >
                <ListItemDecorator>
                  <PlusCircleIcon />
                </ListItemDecorator>
                <ListItemContent>New Workflow</ListItemContent>
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
        <Box flex={3} display="flex" flexDirection="column">
          <Box
            display="flex"
            flexDirection="row"
            alignItems="center"
            mb={1}
            justifyContent="space-between"
          >
            <Typography level="title-lg">
              Workflow {selectedWorkflow?.name}
            </Typography>
            <Box pl={2} display="flex" flexDirection="row" gap={1}>
              <>
                {selectedWorkflow?.status != 'RUNNING' ? (
                  <Button
                    disabled={!selectedWorkflow}
                    startDecorator={<PlayIcon />}
                    onClick={() => runWorkflow(selectedWorkflow.id)}
                  >
                    Run
                  </Button>
                ) : (
                  <Button startDecorator={<PlayIcon />} disabled>
                    Running
                  </Button>
                )}
                <IconButton
                  variant="plain"
                  disabled={!selectedWorkflow}
                  // startDecorator={<BookOpenIcon />}
                  onClick={() => setViewCodeMode(!viewCodeMode)}
                >
                  {viewCodeMode ? <WorkflowIcon /> : <BracesIcon />}
                </IconButton>
                <Dropdown>
                  <MenuButton variant="plain" disabled={!selectedWorkflow}>
                    <EllipsisIcon />
                  </MenuButton>
                  <Menu>
                    <MenuItem
                      onClick={() => {
                        setNewWorkflowModalOpen(true);
                      }}
                    >
                      <ListItemDecorator>
                        <PenIcon />
                      </ListItemDecorator>
                      Edit Workflow Name
                    </MenuItem>
                    <MenuItem
                      color="danger"
                      onClick={async () => {
                        if (
                          confirm(
                            'Are you sure you want to delete workflow ' +
                              selectedWorkflow?.name +
                              '?',
                          )
                        ) {
                          await fetch(
                            chatAPI.Endpoints.Workflows.DeleteWorkflow(
                              selectedWorkflow?.id,
                              experimentInfo.id,
                            ),
                          );
                          mutateWorkflows();
                          setSelectedWorkflowId(null);
                        }
                      }}
                    >
                      <ListItemDecorator>
                        <Trash2Icon />
                      </ListItemDecorator>
                      Delete Workflow
                    </MenuItem>
                  </Menu>
                </Dropdown>
              </>
            </Box>
          </Box>
          <Box
            sx={{
              display: 'flex',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              flexDirection: 'row',
            }}
          >
            {selectedWorkflow ? (
              viewCodeMode ? (
                <ShowCode
                  code={selectedWorkflow}
                  experimentInfo={experimentInfo}
                  mutateWorkflows={mutateWorkflows}
                />
              ) : (
                <WorkflowCanvas
                  selectedWorkflow={selectedWorkflow}
                  setNewNodeModalOpen={setNewNodeflowModalOpen}
                  mutateWorkflows={mutateWorkflows}
                  experimentInfo={experimentInfo}
                />
              )
            ) : (
              <Box sx={{ width: '100%', backgroundColor: '#F7F9FB' }} p={4}>
                &nbsp;
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}
