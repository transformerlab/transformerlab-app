import { Background, ControlButton, Controls, ReactFlow } from '@xyflow/react';
import { PlusCircleIcon } from 'lucide-react';
import React from 'react';

function generateNodes(workflow: any) {
  let out: any[] = [];
  let currentTask = '0';
  let position = 0;

  const workflowConfig = JSON.parse(workflow?.config);
  console.log(workflowConfig);

  while (currentTask < workflowConfig.nodes.length) {
    out.push({
      id: currentTask,
      position: { x: 0, y: position },
      data: { label: workflowConfig.nodes[currentTask].name },
    });
    position += 100;
    currentTask = workflowConfig.nodes[currentTask].out;
  }

  return out;
}

function generateEdges(workflow: any) {
  let out: any[] = [];
  let currentTask = '0';
  let ids = '0';

  const workflowConfig = JSON.parse(workflow?.config);
  console.log(workflowConfig);

  while (currentTask < workflowConfig.nodes.length) {
    out.push({
      id: ids,
      source: currentTask,
      target: workflowConfig.nodes[currentTask].out,
      markerEnd: {
        type: 'arrow',
      },
    });
    ids += 1;
    currentTask = workflowConfig.nodes[currentTask].out;
  }

  return out;
}

export default function WorkflowCanvas({ selectedWorkflow }) {
  return (
    <ReactFlow
      nodes={generateNodes(selectedWorkflow)}
      edges={generateEdges(selectedWorkflow)}
      fitView
      style={{ backgroundColor: '#F7F9FB' }}
    >
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
      <PlusCircleIcon
        style={{ position: 'absolute', bottom: '20px', right: '20px' }}
        strokeWidth={2}
        size={32}
      />
    </ReactFlow>
  );
}
