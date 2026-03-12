import React from "react";
import { AbsoluteFill } from "remotion";

const TOOLBAR_HEIGHT = 48;

const toolbarStyle: React.CSSProperties = {
  height: TOOLBAR_HEIGHT,
  background: "linear-gradient(to bottom, #e8e8e8, #d4d4d4)",
  display: "flex",
  alignItems: "center",
  padding: "0 16px",
  gap: 8,
  borderBottom: "1px solid #b0b0b0",
  flexShrink: 0,
};

const dotStyle = (color: string): React.CSSProperties => ({
  width: 12,
  height: 12,
  borderRadius: "50%",
  background: color,
  border: "1px solid rgba(0,0,0,0.15)",
});

const addressBarStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  background: "#ffffff",
  borderRadius: 6,
  marginLeft: 12,
  display: "flex",
  alignItems: "center",
  paddingLeft: 12,
  fontSize: 13,
  color: "#555",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  border: "1px solid #c0c0c0",
};

/**
 * A macOS-style browser chrome frame that wraps children.
 * Renders traffic lights and a fake address bar.
 */
export const BrowserFrame: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: "#1a1a1a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <div style={dotStyle("#ff5f57")} />
        <div style={dotStyle("#ffbd2e")} />
        <div style={dotStyle("#28c840")} />
        <div style={addressBarStyle}>
          <span>🔒</span>
          <span style={{ marginLeft: 6 }}>beta.lab.cloud</span>
        </div>
      </div>

      {/* Video content area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
