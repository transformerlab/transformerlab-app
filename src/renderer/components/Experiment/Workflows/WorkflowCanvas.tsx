import { Button } from '@mui/joy';
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { PlusCircleIcon } from 'lucide-react';
import { useEffect } from 'react';
import CustomNode from './CustomNode';

const nodeTypes = { customNode: CustomNode };

function generateNodes(workflow: any) {
  const workflowConfig = JSON.parse(workflow?.config);

  if (workflowConfig.nodes.length == 0) {
    return [];
  }

  let out: any[] = [];
  let currentTask = workflowConfig.nodes[0].id;
  let position = 0;

  console.log(workflowConfig);

  while (currentTask != 'END') {
    let currentNode = {};
    workflowConfig.nodes.forEach((node) => {
      if (node.id == currentTask) {
        currentNode = node;
      }
    });

    // console.log(currentNode);

    const data = {
      id: currentNode?.id,
      label: currentNode.name,
      jobType: currentNode.type,
      template: currentNode.template,
      metadata: currentNode?.metadata,
    };
    const nextNode = {
      id: currentTask,
      type: 'customNode',
      position: { x: 0, y: position },
      data: data,
    };
    out.push(nextNode);
    position += 120;
    currentTask = currentNode.out;
  }

  return out;
}

function generateEdges(workflow: any) {
  const workflowConfig = JSON.parse(workflow?.config);
  if (workflowConfig.nodes.length <= 1) {
    return [];
  }

  let out: any[] = [];
  let currentTask = workflowConfig.nodes[0].id;
  let ids = workflowConfig.nodes[0].id;

  console.log(workflowConfig);

  while (currentTask != 'END') {
    let currentNode = {};
    workflowConfig.nodes.forEach((node) => {
      if (node.id == currentTask) {
        currentNode = node;
      }
    });

    out.push({
      id: ids,
      source: currentTask,
      target: currentNode.out,
      markerEnd: {
        type: 'arrow',
      },
    });
    ids += 1;
    currentTask = currentNode.out;
  }

  return out;
}

const Flow = ({ selectedWorkflow, setNewNodeModalOpen = (x) => {} }) => {
  const reactFlowInstance = useReactFlow();
  // Use fitView after the component mounts
  useEffect(() => {
    // Wait a moment to ensure the flow is rendered before fitting
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({
        includeHiddenNodes: false, // Don't include hidden nodes
        minZoom: 0.5, // Set minimum zoom level
        maxZoom: 2, // Set maximum zoom level
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [reactFlowInstance, selectedWorkflow]);

  return (
    <ReactFlow
      nodes={generateNodes(selectedWorkflow)}
      edges={generateEdges(selectedWorkflow)}
      nodeTypes={nodeTypes}
      fitView
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      panOnScroll={false}
      style={{
        backgroundColor: 'var(--joy-palette-background-level2)',
      }}
    >
      <Button
        onClick={() => {
          setNewNodeModalOpen(true);
        }}
        variant="soft"
        sx={{
          zIndex: '1000',
          position: 'absolute',
          bottom: '20px',
          right: '20px',
        }}
        startDecorator={<PlusCircleIcon strokeWidth={2} size={32} />}
      >
        Add Node
      </Button>
      <Background color="#96ADE9" />
      <Controls>
        <ControlButton
          onClick={() => {
            alert('hi');
          }}
        >
          *
        </ControlButton>
      </Controls>
    </ReactFlow>
  );
};

export default function WorkflowCanvas({
  selectedWorkflow,
  setNewNodeModalOpen = () => {},
}) {
  if (!selectedWorkflow) {
    return null;
  }
  return (
    <ReactFlowProvider>
      <Flow
        selectedWorkflow={selectedWorkflow}
        setNewNodeModalOpen={setNewNodeModalOpen}
      />
    </ReactFlowProvider>
  );
}
