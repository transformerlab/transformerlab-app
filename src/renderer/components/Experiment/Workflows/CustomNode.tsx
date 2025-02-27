import { BuiltInNode, Handle } from '@xyflow/react';
import { NodeProps, Position } from '@xyflow/system';
import { CircleXIcon, SquareXIcon, XIcon } from 'lucide-react';

export default function CustomNode({
  data,
  isConnectable,
  targetPosition = Position.Top,
  sourcePosition = Position.Bottom,
}: NodeProps<BuiltInNode>) {
  return (
    <div className="custom-node">
      <div
        className="custom-node-delete-button"
        style={{
          position: 'absolute',
          cursor: 'pointer',
          borderRadius: '50%',
        }}
      >
        <XIcon size="12px" />
      </div>
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
      />
      {data?.label}
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
    </div>
  );
}
