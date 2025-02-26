import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import Tooltip from '@mui/joy/Tooltip';

// Sample JSON data representing the model journey
const sampleData = {
  models: [
    {
      type: 'base_model',
      id: 'meta/llama3.1-8B-instruct',
      name: 'meta/llama3.1-8B-instruct',
      children: [
        {
          type: 'fine_tuning_job',
          jobId: 1,
          metadata: { dataset: 'Dataset A' },
          child: {
            type: 'fine_tuned_model',
            modelId: 'ft_model_1',
            name: 'Fine Tuned Model 1',
            children: [
              {
                type: 'eval_job',
                jobId: 2,
                metadata: { metric: 'accuracy', value: 95.5 }
              },
              {
                type: 'eval_job',
                jobId: 3,
                metadata: { metric: 'accuracy', value: 96.7 }
              },
              {
                type: 'fine_tuning_job',
                jobId: 6,
                metadata: { dataset: 'Dataset B' },
                child: {
                  type: 'fine_tuned_model',
                  modelId: 'ft_model_3',
                  name: 'Fine Tuned Model 3',
                  children: []
                }
              }
            ]
          }
        },
        {
          type: 'fine_tuning_job',
          jobId: 4,
          metadata: { dataset: 'Dataset C' },
          child: {
            type: 'fine_tuned_model',
            modelId: 'ft_model_2',
            name: 'Fine Tuned Model 2',
            children: [
              {
                type: 'eval_job',
                jobId: 5,
                metadata: { metric: 'accuracy', value: 97.0 }
              }
            ]
          }
        }
      ]
    }
  ]
};

// Determine styles based on the node type.
const getNodeStyle = (node) => {
  switch (node.type) {
    case 'base_model':
      return { backgroundColor: 'primary.light', color: 'primary.contrastText', border: '1px solid', borderColor: 'divider' };
    case 'fine_tuned_model':
      return { backgroundColor: 'info.light', color: 'info.contrastText', border: '1px solid', borderColor: 'divider' };
    case 'fine_tuning_job':
      return { backgroundColor: 'success.light', color: 'success.contrastText', border: '1px solid', borderColor: 'divider' };
    case 'eval_job':
      return { backgroundColor: 'warning.light', color: 'warning.contrastText', border: '1px solid', borderColor: 'divider' };
    default:
      return {};
  }
};

// Return a label based on node type.
const getNodeLabel = (node) => {
  switch (node.type) {
    case 'base_model':
      return node.name;
    case 'fine_tuned_model':
      return node.name;
    case 'fine_tuning_job':
      return `Fine Tuning Job (ID: ${node.jobId})`;
    case 'eval_job':
      return `Evaluation (ID: ${node.jobId})`;
    default:
      return 'Node';
  }
};

// Prepare tooltip content from metadata (if available)
const getTooltipContent = (node) => {
  if (node.metadata) {
    return Object.entries(node.metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
  return node.name || '';
};

// Recursive component that renders a job or model node.
const JourneyNode = ({ node }) => {
  const navigate = useNavigate();

  // Click handling: navigate based on the type.
  const handleClick = (e) => {
    e.stopPropagation();
    if (node.type === 'fine_tuning_job' || node.type === 'eval_job') {
      navigate(`/job/${node.jobId}`);
    } else if (node.type === 'base_model' || node.type === 'fine_tuned_model') {
      // For models, use either node.id or node.modelId
      navigate(`/model/${node.id || node.modelId}`);
    }
  };

  return (
    <Box sx={{ ml: 4, mt: 2, position: 'relative' }}>
      <Tooltip title={getTooltipContent(node)} arrow placement="right">
        <Box
          onClick={handleClick}
          sx={{
            display: 'inline-block',
            px: 1,
            py: 0.5,
            borderRadius: '8px',
            ...getNodeStyle(node),
            position: 'relative',
            zIndex: 1,
            cursor: 'pointer'
          }}
        >
          <Typography level="body2">{getNodeLabel(node)}</Typography>
        </Box>
      </Tooltip>

      {/* For a fine tuning job, render its single child (the resulting model) */}
      {node.type === 'fine_tuning_job' && node.child && (
        <Box sx={{ display: 'flex', mt: 2 }}>
          <Box sx={{ width: 20, position: 'relative' }}>
            <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '2px solid #ccc' }} />
          </Box>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Box sx={{ width: 20, position: 'relative' }}>
                <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 20, borderTop: '2px solid #ccc' }} />
              </Box>
              <JourneyNode node={node.child} />
            </Box>
          </Box>
        </Box>
      )}

      {/* For model nodes (base_model or fine_tuned_model) with a children array */}
      {(node.type === 'base_model' || node.type === 'fine_tuned_model') &&
        node.children &&
        node.children.length > 0 && (
          <Box sx={{ display: 'flex', mt: 2 }}>
            <Box sx={{ width: 20, position: 'relative' }}>
              <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '2px solid #ccc' }} />
            </Box>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {node.children.map((child) => (
                <Box key={child.jobId || child.modelId} sx={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <Box sx={{ width: 20, position: 'relative' }}>
                    <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 20, borderTop: '2px solid #ccc' }} />
                  </Box>
                  <JourneyNode node={child} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
    </Box>
  );
};

// The base model container is minimized by default and expands when clicked.
const BaseModelBox = ({ model }) => {
  const [expanded, setExpanded] = useState(false);

  // Toggle expansion on header click.
  const handleHeaderClick = (e) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        mb: 4,
        position: 'relative',
        cursor: 'pointer'
      }}
      onClick={handleHeaderClick}
    >
      {/* Base model header (always visible) */}
      <Tooltip title={`Base Model: ${model.name}`} arrow placement="top">
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            borderRadius: '8px',
            px: 1,
            py: 0.5,
            backgroundColor: 'primary.light',
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Typography level="body2">{model.name}</Typography>
        </Box>
      </Tooltip>
      {/* Expanded content shows the journey (child nodes) */}
      {expanded && (
        <Box sx={{ mt: 4 }}>
          {model.children &&
            model.children.map((child) => (
              <JourneyNode key={child.jobId || child.modelId} node={child} />
            ))}
        </Box>
      )}
    </Box>
  );
};

const ModelJourney = () => {
  return (
    <Box sx={{ p: 2 }}>
      {sampleData.models.map((model) => (
        <BaseModelBox key={model.id} model={model} />
      ))}
    </Box>
  );
};

export default ModelJourney;
