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

function generateNodes(workflow: any, workflowRun: any): any[] {
  const workflowConfig = JSON.parse(workflow?.config);
  const workflowRunNodes = JSON.parse(workflowRun.run.node_ids);
  const workflowRunJobs = workflowRun.jobs;

  if (workflowConfig.nodes.length == 0) {
    return [];
  }

  let out: any[] = [];
  let currentTask = workflowConfig.nodes[0].id;
  let position = 0;

  for (let i = 0; i < workflowConfig.nodes.length; i++) {
    const node = workflowConfig.nodes[i];
    let status = 'NOT QUEUED';

    for (let i = 0; i < workflowRunNodes.length; i++) {
      if (node.id == workflowRunNodes[i]) {
        status = workflowRunJobs[i].status;
      }
    }
    console.log(status);

    const data = {
      id: node?.id,
      label: node.name,
      jobType: status,
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

const Flow = ({ selectedWorkflowRun }: { selectedWorkflowRun: any }) => {
  const selectedWorkflow = selectedWorkflowRun.workflow;
  const [nodes, setNodes, onNodesChange] = useNodesState(
    generateNodes(selectedWorkflow, selectedWorkflowRun),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    generateEdges(selectedWorkflow),
  );

  const reactFlowInstance = useReactFlow();

  const workflowId = selectedWorkflow?.id;

  // The workflow isn't updating when I switch workflows
  // so I do this hack:
  useEffect(() => {
    // console.log('updating workflow');
    setNodes(generateNodes(selectedWorkflow, selectedWorkflowRun));
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
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
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--joy-palette-background-level1), white 60%)',
      }}
    >
      <Background color="#96ADE9" />
    </ReactFlow>
  );
};

export default function WorkflowRunCanvas({
  selectedWorkflowRun,
}: {
  selectedWorkflowRun: any;
}) {
  if (!selectedWorkflowRun) {
    return null;
  }
  return (
    <ReactFlowProvider>
      <Flow selectedWorkflowRun={selectedWorkflowRun} />
    </ReactFlowProvider>
  );
}
