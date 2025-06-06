import React from 'react';

interface SimpleTextAreaProps {
  value: string;
  setValue: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/** *****
 * Here we implement our own simple textarea component. This is to be used instead
 * of MUI Joy's Textarea because MUI Joy has a bug where the resize observer keeps
 * causing issues.
 ***** */
export default function SimpleTextArea({
  value,
  setValue,
  rows = 6,
  placeholder = 'Describe the image you want to generate',
}: SimpleTextAreaProps) {
  return (
    <div
      style={{
        borderRadius: '8px',
        width: '100%',
        border: '1px solid var(--joy-palette-primary-outlinedBorder)',
        overflow: 'hidden',
      }}
    >
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          resize: 'none',
          width: '100%',
          border: 'none',
          backgroundColor: 'transparent',
          outline: 'none',
          padding: 8,
          font: 'inherit',
        }}
        onFocus={(e) => {
          e.target.style.boxShadow = 'none';
          e.target.parentElement!.style.border =
            '1.5px solid var(--joy-palette-primary-400)';
        }}
        onBlur={(e) => {
          e.target.style.boxShadow = 'none';
          e.target.parentElement!.style.border =
            '1px solid var(--joy-palette-primary-outlinedBorder)';
        }}
      />
    </div>
  );
}
