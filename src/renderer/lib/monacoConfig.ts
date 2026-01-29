import fairyflossTheme from '../components/Shared/fairyfloss.tmTheme.js';
import { parseTmTheme } from 'monaco-themes';

/**
 * Sets up the Monaco Editor theme
 */
export function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);
  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

/**
 * Gets improved Monaco Editor options with better text selection support
 */
export function getMonacoEditorOptions(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    // Text selection improvements
    selectOnLineNumbers: true,
    selectionHighlight: true,
    occurrencesHighlight: true,
    // Smart selection - enables expanding selection intelligently
    // Use Alt+Shift+Right to expand selection, Alt+Shift+Left to shrink
    selectLeadingAndTrailingWhitespace: true,
    // Multi-cursor and column selection
    multiCursorModifier: 'ctrlCmd',
    columnSelection: true,
    // Rendering improvements
    renderLineHighlight: 'all',
    renderWhitespace: 'selection',
    // Editing improvements
    dragAndDrop: true,
    formatOnPaste: true,
    formatOnType: false,
    // Autocomplete
    quickSuggestions: true,
    wordBasedSuggestions: false,
    // UI improvements
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    // Word wrap and cursor
    wordWrap: 'off',
    cursorStyle: 'line',
    // Better selection visual feedback
    renderIndentGuides: true,
    highlightActiveIndentGuide: true,
    // Accept suggestion on commit characters
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    // Tab behavior
    tabSize: 2,
    insertSpaces: true,
    // Accessibility
    accessibilitySupport: 'auto',
    // ... allow overrides
    ...overrides,
  };
}
