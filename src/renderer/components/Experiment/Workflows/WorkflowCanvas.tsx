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
import { NetworkIcon, PlusCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect } from 'react';
import CustomNode from './nodes/CustomNode';
import StartNode from './nodes/StartNode';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ELK from 'elkjs/lib/elk.bundled.js';

const nodeTypes = { customNode: CustomNode, startNode: StartNode };

const elk = new ELK();

// Elk has a *huge* amount of options to configure. To see everything you can
// tweak check out:
//
// - https://www.eclipse.org/elk/reference/algorithms.html
// - https://www.eclipse.org/elk/reference/options.html
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.spacing.nodeNode': '80',
};

const getLayoutedElements = (nodes, edges, options = {}) => {
  const isHorizontal = options?.['elk.direction'] === 'RIGHT';
  const graph = {
    id: 'root',
    layoutOptions: options,
    children: nodes.map((node) => ({
      ...node,
      // Adjust the target and source handle positions based on the layout
      // direction.
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',

      // Use the actual width and height of the node if available.
      width: node.width || 150,
      height: node.height || 40,
    })),
    edges: edges,
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => ({
      nodes: layoutedGraph.children.map((node) => ({
        ...node,
        // React Flow expects a position property on the node instead of `x`
        // and `y` fields.
        position: { x: node.x, y: node.y },
        metadata: { ...node.metadata, position: { x: node.x, y: node.y } },
        width: null, // don't set the width and height of the real nodes
        height: null, // don't set the width and height of the real nodes
      })),

      edges: layoutedGraph.edges,
    }))
    .catch(console.error);
};

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
        animated: false,
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

  function saveNodeMetadata(node) {
    const metadata = JSON.stringify({
      position: node.position,
    });
    fetch(
      chatAPI.Endpoints.Workflows.EditNodeMetadata(
        workflowId,
        node?.id,
        metadata
      )
    );
  }

  const onNodeDragStop = useCallback(
    async (event, node) => {
      const metadata = JSON.stringify({
        position: node.position,
      });
      fetch(
        chatAPI.Endpoints.Workflows.EditNodeMetadata(
          workflowId,
          node?.id,
          metadata
        )
      );
      mutateWorkflows();
    },
    [selectedWorkflow]
  );

  const onLayout = useCallback(
    ({ direction, useInitialNodes = false }) => {
      const opts = { 'elk.direction': direction, ...elkOptions };
      const ns = useInitialNodes ? [] : nodes;
      const es = useInitialNodes ? [] : edges;

      getLayoutedElements(ns, es, opts).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);

          // for (const node of layoutedNodes) {
          //   saveNodeMetadata(node);
          // }
          // mutateWorkflows();

          window.requestAnimationFrame(() => reactFlowInstance.fitView());
        }
      );
    },
    [nodes, edges]
  );
  // // Calculate the initial layout on mount.
  // useLayoutEffect(() => {
  //   onLayout({ direction: 'DOWN', useInitialNodes: true });
  // }, []);

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
        for (const node of nodes) {
          // console.log('delete node: ' + node?.id);
          await fetch(
            chatAPI.Endpoints.Workflows.DeleteNode(workflowId, node?.id)
          );
        }
        mutateWorkflows();
      }}
      style={{
        backgroundColor: 'var(--joy-palette-background-surface)',
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
        <ControlButton onClick={() => onLayout({ direction: 'DOWN' })}>
          <NetworkIcon strokeWidth={2} />
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
