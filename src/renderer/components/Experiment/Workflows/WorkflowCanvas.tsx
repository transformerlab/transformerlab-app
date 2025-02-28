import { Button } from '@mui/joy';
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { PlusCircleIcon } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import CustomNode from './CustomNode';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

const nodeTypes = { customNode: CustomNode };

function generateNodes(workflow: any): any[] {
  const workflowConfig = JSON.parse(workflow?.config);

  if (workflowConfig.nodes.length == 0) {
    return [];
  }

  let out: any[] = [];
  let currentTask = workflowConfig.nodes[0].id;
  let position = 0;

  // console.log(workflowConfig);

  for (let i = 0; i < workflowConfig.nodes.length; i++) {
    const node = workflowConfig.nodes[i];
    // console.log(node);
    const data = {
      id: node?.id,
      label: node.name,
      jobType: node.type,
      template: node.template,
      metadata: node?.metadata,
    };

    const savedPosition = node?.metadata?.position || { x: 0, y: position };

    const nextNode = {
      id: node.id,
      type: 'customNode',
      position: savedPosition,
      data: data,
    };
    out.push(nextNode);
    position += 120;
  }

  return out;
}

function generateEdges(workflow: any) {
  const workflowConfig = JSON.parse(workflow?.config);

  if (workflowConfig.nodes.length < 1) {
    return [];
  }

  let out: any[] = [];
  let currentTask = workflowConfig.nodes[0].id;
  let ids = workflowConfig.nodes[0].id;

  // console.log(workflowConfig);

  for (let i = 0; i < workflowConfig.nodes.length; i++) {
    const currentNode = workflowConfig.nodes[i];

    if (!Array.isArray(currentNode.out)) {
      continue;
    }
    currentNode.out.forEach((nextId) => {
      out.push({
        id: currentNode.id + nextId,
        source: currentNode.id,
        target: nextId,
        markerEnd: {
          type: 'arrow',
        },
      });
    });
  }

  return out;
}

const Flow = ({
  selectedWorkflow,
  setNewNodeModalOpen = (x: boolean) => {},
  mutateWorkflows,
}: {
  selectedWorkflow: any;
  setNewNodeModalOpen: (param: boolean) => void;
  mutateWorkflows: Function;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    generateNodes(selectedWorkflow)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    generateEdges(selectedWorkflow)
  );

  const reactFlowInstance = useReactFlow();

  const workflowId = selectedWorkflow?.id;

  // The workflow isn't updating when I switch workflows
  // so I do this hack:
  useEffect(() => {
    setNodes(generateNodes(selectedWorkflow));
    setEdges(generateEdges(selectedWorkflow));
  }, [selectedWorkflow]);

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

  const onNodeDragStop = useCallback(async (event, node) => {
    const metadata = JSON.stringify({
      position: node.position,
    });
    await fetch(
      chatAPI.Endpoints.Workflows.EditNodeMetadata(
        workflowId,
        node?.id,
        metadata
      )
    );
    mutateWorkflows();
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      fitView
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      panOnScroll={false}
      onDelete={async ({ nodes, edges }) => {
        for (const node of nodes) {
          // console.log('delete node: ' + node?.id);
          await fetch(
            chatAPI.Endpoints.Workflows.DeleteNode(workflowId, node?.id)
          );
        }
        mutateWorkflows();
      }}
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
  setNewNodeModalOpen = (x: boolean) => {},
  mutateWorkflows,
}: {
  selectedWorkflow: any;
  setNewNodeModalOpen: (param: boolean) => void;
  mutateWorkflows: Function;
}) {
  if (!selectedWorkflow) {
    return null;
  }
  return (
    <ReactFlowProvider>
      <Flow
        selectedWorkflow={selectedWorkflow}
        setNewNodeModalOpen={setNewNodeModalOpen}
        mutateWorkflows={mutateWorkflows}
      />
    </ReactFlowProvider>
  );
}
