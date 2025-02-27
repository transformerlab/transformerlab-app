import { Typography } from '@mui/joy';
import { BuiltInNode, Handle } from '@xyflow/react';
import { NodeProps, Position } from '@xyflow/system';
import { XIcon } from 'lucide-react';

export default function memo({
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
        onClick={() => {
          alert('delete node');
        }}
      >
        <XIcon size="12px" />
      </div>
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
      />
      <Typography level="title-sm">{data?.label}</Typography>
      <Typography level="body-sm">{data?.jobType}</Typography>
      <Typography level="body-sm">{data?.template}</Typography>
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
      />
    </div>
  );
}
