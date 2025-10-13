import { Button } from '@mui/joy';
import React from 'react';

const EditTokenModal = ({
  open,
  onClose,
  name,
  token,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  token: string;
  onSave: (token: string) => void;
}) => {
  const [newToken, setNewToken] = React.useState(token);

  // Reset state when modal opens or token changes
  React.useEffect(() => {
    if (open) {
      setNewToken(token || '');
    }
  }, [open, token]);

  if (!open) return null;

  const hasChanged = (newToken || '').trim() !== (token || '').trim();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          width: '90%',
          maxWidth: '400px',
          position: 'relative',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Edit {name} Token</h3>

        <input
          type="text"
          placeholder="Enter new token"
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            marginBottom: '12px',
          }}
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
        />

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <Button
            onClick={onClose}
            style={{
              background: '#ccc',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </Button>

          <Button
            disabled={!hasChanged}
            onClick={() => onSave(newToken.trim())}
            style={{
              background: hasChanged ? '#0d6efd' : '#a0c4ff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: hasChanged ? 'pointer' : '',
              transition: 'background 0.2s ease',
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditTokenModal;
