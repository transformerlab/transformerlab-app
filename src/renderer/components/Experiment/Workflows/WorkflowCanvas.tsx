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
  addEdge,
  reconnectEdge,
} from '@xyflow/react';
import { PlusCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import CustomNode from './nodes/CustomNode';
import StartNode from './nodes/StartNode';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';

const nodeTypes = { customNode: CustomNode, startNode: StartNode };

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
      type: node?.type == 'START' ? 'startNode' : 'customNode',
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
  const workflowId = workflow?.id;

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
      // check if this edge already exist in the out array:
      if (
        out.some(
          (edge) => edge.id === `${workflowId}-${currentNode.id}-${nextId}`,
        )
      ) {
        return;
      }
      out.push({
        id: `${workflowId}-${currentNode.id}-${nextId}`,
        source: currentNode.id,
        target: nextId,
        animated: true,
        type: 'default',
        style: {
          stroke: 'var(--joy-palette-primary-outlinedDisabledColor)',
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: 'arrow',
          color: 'var(--joy-palette-primary-outlinedDisabledColor)',
          width: 12,
          height: 10,
          strokeWidth: 2,
        },
      });
    });
  }
  // console.log(out);
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
  const edgeReconnectSuccessful = useRef(true);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    generateNodes(selectedWorkflow),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    generateEdges(selectedWorkflow),
  );

  const onConnect = useCallback((params) => {
    const newEdge = {
      id: `${selectedWorkflow?.id}-${params.source}-${params.target}`,
      source: params.source,
      target: params.target,
      animated: true,
      type: 'default',
      style: {
        stroke: 'var(--joy-palette-warning-outlinedBorder)',
        strokeWidth: 1.5,
      },
      markerEnd: {
        type: 'arrow',
        color: 'var(--joy-palette-warning-outlinedBorder)',
        width: 12,
        height: 10,
        strokeWidth: 2,
      },
    };
    setEdges((els) => addEdge(newEdge, els));
    fetch(
      chatAPI.Endpoints.Workflows.AddEdge(
        selectedWorkflow?.id,
        params.source,
        params.target,
      ),
      {
        method: 'POST',
      },
    );
    mutateWorkflows();
  }, []);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge, newConnection) => {
    edgeReconnectSuccessful.current = true;
    setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
  }, []);

  const onReconnectEnd = useCallback((_, edge) => {
    if (!edgeReconnectSuccessful.current) {
      setEdges((eds) => {
        const updatedEdges = eds.filter((e) => e.id !== edge.id);
        fetch(
          chatAPI.Endpoints.Workflows.RemoveEdge(
            selectedWorkflow?.id,
            edge.source,
            edge.target,
          ),
          {
            method: 'POST',
          },
        )
          .then(() => {
            mutateWorkflows();
            return updatedEdges;
          })
          .catch((error) => {
            console.error('Failed to remove edge:', error);
          });
        return updatedEdges;
      });
    }

    edgeReconnectSuccessful.current = true;
  }, []);

  const reactFlowInstance = useReactFlow();

  const workflowId = selectedWorkflow?.id;

  // The workflow isn't updating when I switch workflows
  // so I do this hack:
  useEffect(() => {
    // console.log('updating workflow');
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

  const onNodeDragStop = useCallback(
    async (event, node) => {
      const metadata = JSON.stringify({
        position: node.position,
      });
      await fetch(
        chatAPI.Endpoints.Workflows.EditNodeMetadata(
          workflowId,
          node?.id,
          metadata,
        ),
      );
      mutateWorkflows();
    },
    [selectedWorkflow],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      snapToGrid={true}
      snapGrid={[15, 15]}
      elementsSelectable={true}
      nodesDraggable={true}
      nodesConnectable={true}
      fitView
      zoomOnScroll={true}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      panOnScroll={false}
      onDelete={async ({ nodes, edges }) => {
        await Promise.all(
          nodes.map((node) =>
            fetch(chatAPI.Endpoints.Workflows.DeleteNode(workflowId, node?.id)),
          ),
        );
        mutateWorkflows();
      }}
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--joy-palette-background-level1), white 60%)',
      }}
      onConnect={onConnect}
      onReconnectStart={onReconnectStart}
      onReconnect={onReconnect}
      onReconnectEnd={onReconnectEnd}
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
        {/* <ControlButton
          onClick={() => {
            alert('hi');
          }}
        >
          *
        </ControlButton> */}
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
