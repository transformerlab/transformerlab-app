import { Box, Button, ButtonGroup, IconButton, Typography } from '@mui/joy';
import React from 'react';

import ReactCanvasPaint from '../../Shared/ReactCanvasPaint/ReactCanvasPaint';

import { EraserIcon, Icon, Pen, PencilIcon } from 'lucide-react';

export default function Inpainting() {
  const [strokeSize, setStrokeSize] = React.useState(5);
  const [drawMode, setDrawMode] = React.useState<'pencil' | 'eraser'>('pencil');
  const [maskData, setMaskData] = React.useState(null);
  const [showBg, setShowBg] = React.useState(true);
  const [dimensions, setDimensions] = React.useState({
    width: 800,
    height: 600,
  });
  return (
    <Box>
      <Box sx={{}}>
        {showBg && (
          <Box
            component="img"
            src="https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=620&auto=format&fit=crop&q=60&ixlib=rb-4.1.0"
            alt="Background"
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 0,
            }}
          />
        )}
        <Box
          sx={{
            top: 0,
            left: 0,
            opacity: 0.7,
          }}
        >
          <ReactCanvasPaint
            width={dimensions.width}
            height={dimensions.height}
            colors={['#FF0000']}
            strokeWidth={strokeSize}
            drawMode={drawMode}
            onDraw={(e) => {
              setMaskData(e);
            }}
          />
        </Box>
      </Box>
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={() => setShowBg((prev) => !prev)}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          {showBg ? 'Hide Image' : 'Show Image'}
        </Button>
      </Box>
      {/* <Box sx={{ border: '1px solid #ccc', p: 2 }}>
        Preview Mask:
        <ReactCanvasPaint
          viewOnly
          width={dimensions.width / 4}
          height={dimensions.height / 4}
          data={maskData}
        />
      </Box> */}
    </Box>
  );
}
