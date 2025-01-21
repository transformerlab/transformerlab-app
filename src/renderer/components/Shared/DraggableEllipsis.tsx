import { EllipsisIcon } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

export default function DraggableEllipsis({ notifyOnMove = (pos) => {} }) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.target.style.userSelect = 'none';
    setIsDragging(true);
  };

  const handleMouseUp = (e) => {
    e.target.style.userSelect = 'auto';
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX, y: e.clientY });
      notifyOnMove({ x: e.clientX, y: e.clientY });
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        // position: isDragging ? 'absolute' : 'relative',
        // left: isDragging ? position.x : 'auto',
        // top: isDragging ? position.y : 'auto',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: 1100,
        height: '100%',
      }}
    >
      <EllipsisIcon size="18px" />
    </div>
  );
}
