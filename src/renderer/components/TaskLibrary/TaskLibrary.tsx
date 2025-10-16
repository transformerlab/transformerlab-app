/* eslint-disable jsx-a11y/anchor-is-valid */
import Sheet from '@mui/joy/Sheet';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemContent from '@mui/joy/ListItemContent';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import IconButton from '@mui/joy/IconButton';
import Button from '@mui/joy/Button';
import { useState } from 'react';
import {
  RectangleVerticalIcon,
  Edit2,
  Trash2,
  Plus,
  FilePlus,
} from 'lucide-react';

import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

export default function TaskLibrary({}) {
  const { experimentInfo } = useExperimentInfo();

  const initialTasks = [
    {
      id: 'finetune-llama-3',
      title: 'Fine-tune LLaMA 3',
      description:
        'Adapt LLaMA 3 to your domain by training on curated, domain-specific data to improve accuracy, tone, and task performance.',
    },
    {
      id: 'nanochat',
      title: "Train Karpathy's NanoChat",
      description:
        'Build a compact conversational agent optimized for low-latency and on-device usage, suitable for simple chat, FAQ, and assistant workflows.',
    },
    {
      id: 'finetune-unsloth',
      title: 'Fine-tune with UnSloth',
      description:
        'Use the UnSloth toolkit to fine-tune models efficiently with smart optimization and resource-aware schedules for faster iterations.',
    },
    {
      id: 'finetune-gpt-oss',
      title: 'Finetune OpenAI GPT-OSS',
      description: 'Finetune OpenAIs GPT-OSS model.',
    },
    {
      id: 'yolo-object-detection',
      title: 'YOLO Object Detection Training',
      description:
        'Train a YOLO-based detector to localize and classify objects in images, tuned for real-time performance and practical deployment.',
    },
  ];

  const [tasks, setTasks] = useState(initialTasks);

  const handleImportExample = () => {
    console.log('Import example');
  };

  const handleCreate = () => {
    // stub - replace with create flow
    console.log('Create new task');
  };

  const handleEdit = (taskId: string) => {
    // stub - replace with edit flow
    console.log('Edit', taskId);
  };

  const handleDelete = (taskId: string) => {
    if (!window.confirm('Delete this task?')) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <Sheet sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
        }}
      >
        <h2 style={{ margin: 0 }}>Task Library</h2>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="sm"
            variant="outlined"
            onClick={handleImportExample}
            aria-label="Import example"
            startDecorator={<FilePlus size={14} />}
          >
            Import Example
          </Button>

          <Button
            size="sm"
            variant="solid"
            onClick={handleCreate}
            aria-label="Create new task"
            startDecorator={<Plus size={14} />}
          >
            New Task
          </Button>
        </Box>
      </Box>
      <List
        sx={{
          overflow: 'auto',
          gap: 1,
          pt: 2,
        }}
      >
        {tasks.map((task) => (
          <ListItem
            key={task.id}
            sx={{
              alignItems: 'flex-start',
              display: 'flex',
              gap: 1,
              padding: 2,
            }}
            variant="outlined"
          >
            <ListItemDecorator sx={{ mt: '4px' }}>
              <RectangleVerticalIcon />
            </ListItemDecorator>

            <ListItemContent sx={{ minWidth: 0 }}>
              <Typography fontWeight="lg">{task.title}</Typography>
              <Typography level="body2" textColor="text.tertiary">
                {task.description}
              </Typography>
            </ListItemContent>

            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                alignItems: 'center',
                ml: 'auto',
                alignSelf: 'start',
              }}
            >
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                aria-label={`Edit ${task.title}`}
                onClick={() => handleEdit(task.id)}
              >
                <Edit2 size={16} />
              </IconButton>

              <IconButton
                size="sm"
                variant="plain"
                color="danger"
                aria-label={`Delete ${task.title}`}
                onClick={() => handleDelete(task.id)}
              >
                <Trash2 size={16} />
              </IconButton>
            </Box>
          </ListItem>
        ))}
      </List>
    </Sheet>
  );
}
