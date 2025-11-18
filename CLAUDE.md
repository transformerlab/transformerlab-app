# CLAUDE.md - AI Assistant Guide for Transformer Lab

This document provides comprehensive guidance for AI assistants working on the Transformer Lab codebase.

## Table of Contents

- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Codebase Structure](#codebase-structure)
- [Development Workflows](#development-workflows)
- [Architecture Patterns](#architecture-patterns)
- [Key Conventions](#key-conventions)
- [Common Tasks](#common-tasks)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Project Overview

**Transformer Lab** is an open-source desktop application (with cloud deployment support) that allows users to experiment with Large Language Models (LLMs). Users can download models, chat with them, fine-tune them, run evaluations, and perform RAG (Retrieval Augmented Generation).

**Key Features:**
- Model management (download from HuggingFace, convert formats)
- Chat and completion interfaces with streaming support
- Fine-tuning (LoRA, RLHF, DPO, ORPO, SIMPO)
- Multiple inference engines (MLX, vLLM, llama.cpp, FastChat, SGLang)
- Image generation (Stable Diffusion, Flux)
- Plugin system for extensibility
- Visual workflow editor
- RAG with document management
- Model evaluation and embeddings

**Version:** 0.23.1
**License:** AGPL V3
**Main Language:** TypeScript/React
**Framework:** Electron + React

---

## Technology Stack

### Core Technologies
- **Electron 26.2.1** - Desktop app framework
- **React 18.2.0** - UI library
- **TypeScript 5.1.3** - Primary language
- **Webpack 5.98.0** - Build tool
- **Material-UI Joy** (@mui/joy 5.0.0-beta.48) - UI components
- **React Router DOM 6.11.2** - Routing
- **Easy-peasy 6.1.0** - State management (minimal usage)
- **SWR 2.3.2** - Data fetching and caching

### Key Libraries
- **Monaco Editor** (@monaco-editor/react 4.7.0) - Code editor
- **Nivo** - Data visualization charts
- **Uppy** - File upload UI
- **xterm.js** - Terminal emulator
- **XYFlow** - Workflow graph editor
- **React JSON Schema Forms** (@rjsf) - Dynamic form generation
- **WaveSurfer.js** - Audio visualization
- **Three.js** - 3D graphics
- **Lucide React** - Icon library

### Development Tools
- **ESLint** - Linting (erb config)
- **Prettier** - Code formatting (single quotes)
- **Jest** - Testing framework
- **ts-jest** - TypeScript Jest transformer
- **Orval** - OpenAPI code generation

---

## Codebase Structure

```
transformerlab-app/
├── .erb/                     # Electron React Boilerplate configs
│   ├── configs/             # Webpack configurations
│   │   ├── webpack.config.base.ts
│   │   ├── webpack.config.main.prod.ts
│   │   ├── webpack.config.renderer.dev.ts
│   │   ├── webpack.config.renderer.prod.ts
│   │   ├── webpack.config.cloud.dev.ts      # Cloud/web mode
│   │   └── webpack.config.cloud.prod.ts
│   ├── scripts/             # Build/development scripts
│   └── mocks/               # Test mocks
├── .github/                 # GitHub workflows
├── assets/                  # App icons, logos, entitlements
├── docs/                    # K3D project documentation
├── release/                 # Build output
│   ├── app/                # Production app
│   └── build/              # Electron-builder packages
├── scripts/                 # Development utilities
│   ├── server.js           # Local dev server
│   ├── openapi.json        # API specification
│   └── orval/              # API code generation
└── src/                     # Source code
    ├── main/               # Electron main process
    │   ├── main.ts         # App initialization (627 lines)
    │   ├── preload.ts      # Electron mode preload
    │   ├── preload-cloud.ts # Cloud mode preload
    │   ├── util.ts         # Server management utilities
    │   ├── menu.ts         # Application menu
    │   └── shell_commands/ # Shell utilities
    ├── renderer/           # React UI (renderer process)
    │   ├── App.tsx         # Root component
    │   ├── index.tsx       # React entry point
    │   ├── store.js        # Easy-peasy store (minimal)
    │   ├── components/     # React components (175+ files)
    │   │   ├── Experiment/  # Main feature area (LARGEST)
    │   │   │   ├── Audio/
    │   │   │   ├── Diffusion/
    │   │   │   ├── Documents/
    │   │   │   ├── Eval/
    │   │   │   ├── Export/
    │   │   │   ├── Foundation/
    │   │   │   ├── Generate/
    │   │   │   ├── Interact/
    │   │   │   ├── Rag/
    │   │   │   ├── Recipes/
    │   │   │   ├── Train/
    │   │   │   ├── Widgets/
    │   │   │   └── Workflows/
    │   │   ├── ModelZoo/    # Model gallery
    │   │   ├── Plugins/     # Plugin system
    │   │   ├── Data/        # Dataset management
    │   │   ├── Settings/    # App settings
    │   │   ├── Connect/     # Connection management
    │   │   ├── Shared/      # Reusable components
    │   │   └── User/        # Authentication
    │   └── lib/            # Utilities and API
    │       ├── api-client/  # API layer
    │       │   ├── urls.ts
    │       │   ├── endpoints.ts (17,622 bytes)
    │       │   ├── functions.ts
    │       │   ├── chat.ts (26,095 bytes)
    │       │   └── hooks.ts
    │       ├── ExperimentInfoContext.js
    │       ├── theme.ts
    │       └── transformerlab-api-sdk.ts
    └── __tests__/          # Test files
```

### Important File Locations

**Configuration:**
- `package.json` - Dependencies, scripts, build config
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.js` - ESLint rules
- `.prettierrc.json` - Prettier configuration

**Entry Points:**
- `src/main/main.ts` - Electron main process
- `src/main/preload.ts` - Electron preload (desktop mode)
- `src/main/preload-cloud.ts` - Cloud preload (web mode)
- `src/renderer/index.tsx` - React application
- `src/renderer/App.tsx` - Root component

**API Layer:**
- `src/renderer/lib/api-client/endpoints.ts` - All API endpoints
- `src/renderer/lib/api-client/chat.ts` - Chat/inference API
- `src/renderer/lib/api-client/functions.ts` - Utility API functions
- `src/renderer/lib/api-client/hooks.ts` - React hooks for API

**State Management:**
- `src/renderer/store.js` - Easy-peasy store (mostly unused)
- `src/renderer/lib/ExperimentInfoContext.js` - Experiment context
- Most state managed via SWR, React Context, and local state

---

## Development Workflows

### Local Development Setup

```bash
# Install dependencies (Node v22 recommended, NOT v23)
npm install

# Start development server (renderer on port 1212)
npm start

# In another terminal, start Electron main process
npm run start:main

# Start cloud/web version
npm run start:cloud
```

### Build Commands

```bash
# Build all (main + renderer + cloud)
npm run build

# Build specific targets
npm run build:main      # Main process only
npm run build:renderer  # Renderer only
npm run build:cloud     # Cloud version only

# Package for distribution
npm run package

# Run tests
npm test

# Lint code
npm run lint
```

### Development Ports

- **Renderer Dev Server:** http://localhost:1212
- **Cloud Dev Server:** http://localhost:1213 (check webpack config)
- **Backend API:** Configured via window.TransformerLab.API_URL

### Debugging

**Electron:**
- Main process: Uses `electronmon` for hot reload
- Renderer: React DevTools available
- Console: Main process logs in terminal, renderer in DevTools

**VSCode Configuration:**
- Located in `.vscode/launch.json`
- Can attach debugger to main and renderer processes

---

## Architecture Patterns

### Dual-Mode Architecture

The application supports TWO deployment modes:

#### 1. Electron Mode (Desktop)
- Full desktop app with local server management
- Uses `src/main/preload.ts`
- Backend server installed to `~/.transformerlab/`
- Windows: Uses WSL2 for Python backend
- Storage: electron-store
- Platform detection: `window.TransformerLab.appmode === 'electron'`

#### 2. Cloud/Web Mode (Browser)
- Browser-based deployment
- Uses `src/main/preload-cloud.ts` (stubs Electron APIs)
- Connects to remote API server
- Storage: localStorage
- Platform detection: `window.TransformerLab.appmode === 'cloud'`

**Key Pattern:**
```typescript
// Check mode before using Electron APIs
if (window.TransformerLab?.appmode === 'electron') {
  await window.electron.ipcRenderer.invoke('someCommand');
}
```

### API Communication

**Architecture:**
```
React Components
    ↓
SWR Hooks (data fetching/caching)
    ↓
API Client (src/renderer/lib/api-client/)
    ↓
HTTP/HTTPS REST API
    ↓
Backend Server (Python/FastAPI)
```

**Pattern:**
```typescript
// Using SWR for data fetching
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const fetcher = (url) => fetch(url).then(res => res.json());

function MyComponent() {
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Models.LocalList(),
    fetcher
  );

  // mutate() to refresh data
  // data, error, isLoading for state
}
```

**Streaming Pattern:**
```typescript
import { sendAndReceiveStreaming } from 'renderer/lib/transformerlab-api-sdk';

await sendAndReceiveStreaming(
  experimentInfo?.config?.inferenceParams,
  messages,
  (chunk) => {
    // Handle each streamed chunk
    setResponse(prev => prev + chunk);
  },
  (error) => {
    // Handle errors
  },
  () => {
    // On complete
  }
);
```

### State Management

**Primary Methods:**
1. **SWR** - Server data with caching
2. **React Context** - Shared state (ExperimentInfoContext)
3. **URL Params** - Navigation state (React Router)
4. **Local State** - Component-specific (useState)
5. **Easy-peasy** - Minimal usage (legacy)

**Experiment Context Pattern:**
```typescript
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';

function MyComponent() {
  const {
    experimentInfo,           // Current experiment data
    experimentInfoMutate,     // Refresh experiment data
    setExperimentId           // Change current experiment
  } = useExperimentInfo();

  // experimentInfo.config.inferenceParams
  // experimentInfo.config.foundation
}
```

### IPC Communication (Electron Mode)

**Renderer → Main:**
```typescript
// Invoke (request/response)
const result = await window.electron.ipcRenderer.invoke(
  'server:startLocalServer'
);

// Send one-way
window.electron.ipcRenderer.send('someChannel', data);
```

**Main → Renderer:**
```typescript
// Listen for events
window.electron.ipcRenderer.on('serverLog:update', (data) => {
  console.log(data);
});

// Remove listener
window.electron.ipcRenderer.removeListener('serverLog:update', handler);
```

**Available Channels:**
- `server:*` - Server management
- `storage:*` - Data persistence
- `ssh:*` - SSH client operations
- `autoUpdater:*` - App updates
- `serverLog:*` - Log streaming

### Storage Pattern

```typescript
// Set value
await window.storage.set('key', value);

// Get value
const value = await window.storage.get('key');

// Delete value
await window.storage.delete('key');

// In Electron mode: Uses electron-store
// In Cloud mode: Uses localStorage
```

---

## Key Conventions

### Code Style

**TypeScript:**
- Strict mode enabled
- Use explicit types where helpful
- Prefer interfaces over types for object shapes
- Use `async/await` over promises

**React:**
- Functional components only (no class components)
- Hooks for state and effects
- Props destructuring in component signature
- PascalCase for component files (e.g., `MyComponent.tsx`)

**Naming:**
- Components: PascalCase (`ChatInterface.tsx`)
- Utilities: camelCase (`apiClient.ts`)
- Constants: UPPER_SNAKE_CASE
- CSS modules: kebab-case

**Formatting:**
- Single quotes for strings
- 2-space indentation
- No semicolons (where optional)
- Run `npm run lint` before committing

### File Organization

**Component Structure:**
```typescript
// MyComponent.tsx
import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/joy';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

// Types/interfaces at top
interface MyComponentProps {
  experimentId: string;
}

// Component
export default function MyComponent({ experimentId }: MyComponentProps) {
  // Hooks first
  const [state, setState] = useState();
  const { data } = useSWR(chatAPI.Endpoints.Models.LocalList());

  useEffect(() => {
    // Side effects
  }, []);

  // Event handlers
  const handleClick = () => {
    // ...
  };

  // Render
  return (
    <Box>
      <Typography>Content</Typography>
    </Box>
  );
}
```

**Directory Structure:**
- Group related components in subdirectories
- Place shared components in `components/Shared/`
- Utility functions in `lib/`
- Types in same file or `types.ts` if shared

### API Endpoints

**Pattern:**
```typescript
// In src/renderer/lib/api-client/endpoints.ts
export const Endpoints = {
  Models: {
    LocalList: () => API_URL() + '/models/local',
    Get: (modelId: string) => API_URL() + `/models/${modelId}`,
    Delete: (modelId: string) => API_URL() + `/models/${modelId}`,
  },
  Experiment: {
    Get: (experimentId: string) =>
      API_URL() + `/experiments/${experimentId}`,
    Update: (experimentId: string) =>
      API_URL() + `/experiments/${experimentId}`,
  }
};
```

**Usage:**
```typescript
// Fetching
const url = chatAPI.Endpoints.Models.Get('my-model-id');
const response = await fetch(url);

// With SWR
const { data } = useSWR(chatAPI.Endpoints.Models.LocalList(), fetcher);
```

### Error Handling

**API Errors:**
```typescript
const { data, error, isLoading } = useSWR(url, fetcher);

if (error) {
  return <ErrorDisplay error={error} />;
}

if (isLoading) {
  return <LoadingSpinner />;
}

// Use data
```

**Try/Catch:**
```typescript
try {
  const result = await someAsyncOperation();
  // Handle success
} catch (error) {
  console.error('Operation failed:', error);
  // Show user-friendly error message
}
```

### Plugin System

**Plugin Structure:**
- Each plugin is a directory under experiment scripts
- Required: `index.json` manifest file
- Plugin types: `trainer`, `inference`, `evaluation`, `data`

**Manifest Example (`index.json`):**
```json
{
  "name": "My Plugin",
  "uniqueId": "my-plugin",
  "description": "Plugin description",
  "type": "trainer",
  "version": "1.0.0",
  "parameters": {
    "learning_rate": {
      "type": "number",
      "default": 0.001,
      "description": "Learning rate"
    }
  }
}
```

**Dynamic Forms:**
- Use React JSON Schema Forms (@rjsf)
- Schema defined in plugin manifest
- `DynamicPluginForm.tsx` renders forms

---

## Common Tasks

### Adding a New API Endpoint

1. **Update OpenAPI spec** (if using code generation):
   - Edit `scripts/openapi.json`
   - Run `npm run generate:api` (if configured)

2. **Add to endpoints.ts:**
```typescript
// src/renderer/lib/api-client/endpoints.ts
export const Endpoints = {
  MyFeature: {
    List: () => API_URL() + '/my-feature',
    Get: (id: string) => API_URL() + `/my-feature/${id}`,
  }
};
```

3. **Create API function** (optional):
```typescript
// src/renderer/lib/api-client/functions.ts
export async function getMyFeature(id: string) {
  const response = await fetch(Endpoints.MyFeature.Get(id));
  return response.json();
}
```

4. **Use in component:**
```typescript
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const { data } = useSWR(chatAPI.Endpoints.MyFeature.List(), fetcher);
```

### Adding a New Page/Route

1. **Create component:**
```typescript
// src/renderer/components/MyFeature/MyFeature.tsx
export default function MyFeature() {
  return <div>My Feature</div>;
}
```

2. **Add route:**
```typescript
// src/renderer/components/MainAppPanel.tsx
import MyFeature from './MyFeature/MyFeature';

// In Routes:
<Route path="/my-feature" element={<MyFeature />} />
```

3. **Add navigation link:**
```typescript
// src/renderer/components/Nav/LeftNav.tsx or appropriate nav component
<NavLink to="/my-feature">My Feature</NavLink>
```

### Adding a New Experiment Tab

1. **Create component in Experiment directory:**
```typescript
// src/renderer/components/Experiment/MyTab/MyTab.tsx
export default function MyTab() {
  const { experimentInfo } = useExperimentInfo();
  return <div>Tab content for {experimentInfo.id}</div>;
}
```

2. **Add to Experiment.tsx tabs:**
```typescript
// Find tabs array and add:
{
  label: 'My Tab',
  value: 'mytab',
  component: <MyTab />
}
```

### Working with the Monaco Editor

```typescript
import Editor from '@monaco-editor/react';

function CodeEditor({ value, onChange, language = 'python' }) {
  return (
    <Editor
      height="500px"
      language={language}
      value={value}
      onChange={(newValue) => onChange(newValue)}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
      }}
    />
  );
}
```

### Implementing Streaming Responses

```typescript
import { sendAndReceiveStreaming } from 'renderer/lib/transformerlab-api-sdk';

const [response, setResponse] = useState('');
const [isStreaming, setIsStreaming] = useState(false);

async function streamChat() {
  setIsStreaming(true);
  setResponse('');

  await sendAndReceiveStreaming(
    inferenceParams,
    messages,
    (chunk) => {
      setResponse(prev => prev + chunk);
    },
    (error) => {
      console.error('Stream error:', error);
      setIsStreaming(false);
    },
    () => {
      setIsStreaming(false);
    }
  );
}
```

### Using the Workflow System

**Graph Structure:**
- Nodes: Processing units
- Edges: Connections between nodes
- Uses XYFlow for visualization

**Pattern:**
```typescript
import { ReactFlow, Node, Edge } from '@xyflow/react';

const nodes: Node[] = [
  { id: '1', type: 'input', data: { label: 'Input' }, position: { x: 0, y: 0 } }
];

const edges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' }
];
```

---

## Testing

### Test Configuration

**Framework:** Jest 29.5.0
**Environment:** jsdom
**Transformer:** ts-jest
**Location:** `src/__tests__/`

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- MyComponent.test.tsx
```

### Writing Tests

```typescript
// src/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import MyComponent from '../renderer/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const { user } = render(<MyComponent />);
    const button = screen.getByRole('button');
    await user.click(button);
    // Assert expected behavior
  });
});
```

### Test Coverage

**Current Status:**
- Limited test coverage
- Mostly integration testing via manual QA
- Primary test: `App.test.tsx`

**Best Practices:**
- Write tests for critical paths
- Test error states
- Test user interactions
- Mock API calls with MSW (if implemented)

---

## Deployment

### Building for Production

```bash
# Clean and build
npm run package
```

**Output:**
- macOS: `release/build/transformerlab-*.dmg`
- Windows: `release/build/transformerlab-*.exe`
- Linux: `release/build/transformerlab-*.AppImage`

### Electron Builder Configuration

Located in `package.json` under `"build"`:

**Platforms:**
- macOS: Universal (arm64 + x64)
- Windows: x64 only
- Linux: AppImage (arm64 + x64)

**Code Signing:**
- macOS: Configured with entitlements
- Windows: Publisher name set
- Notarization: `.erb/scripts/notarize.js`

### Auto-Updates

**System:** electron-updater
**Provider:** GitHub Releases
**Configuration:**
```json
"publish": {
  "provider": "github",
  "owner": "transformerlab",
  "repo": "transformerlab-app"
}
```

**Implementation:**
- Main process checks for updates on startup
- Downloads and installs automatically
- User notified via modal in renderer

### Cloud Deployment

**Build:**
```bash
npm run build:cloud
```

**Output:**
- `release/app/dist/renderer/` - Static files
- Serve with any static hosting (Vercel, Netlify, etc.)

**Requirements:**
- Backend API server must be accessible
- Configure `window.TransformerLab.API_URL` in preload

---

## Important Notes for AI Assistants

### When Working on This Codebase

1. **Check Dual-Mode Compatibility:**
   - Test changes work in both Electron and Cloud modes
   - Use platform detection before calling Electron APIs
   - Ensure storage abstraction is used correctly

2. **API-First Approach:**
   - Backend API changes may be needed
   - Check `scripts/openapi.json` for API spec
   - Update endpoint definitions in `endpoints.ts`

3. **State Management:**
   - Prefer SWR for server data (automatic caching/revalidation)
   - Use ExperimentInfoContext for current experiment
   - Avoid adding to easy-peasy store (minimize global state)

4. **Plugin System:**
   - Plugins are experiment-scoped
   - Must have `index.json` manifest
   - Dynamic forms generated from JSON schema

5. **Error Handling:**
   - Always handle loading and error states
   - Provide user-friendly error messages
   - Log errors for debugging

6. **Performance:**
   - Use React.memo for expensive components
   - Implement virtualization for long lists
   - Debounce rapid API calls

7. **TypeScript:**
   - Add proper types for new components/functions
   - Don't use `any` unless absolutely necessary
   - Leverage IntelliSense for API exploration

8. **Backwards Compatibility:**
   - User data stored in `~/.transformerlab/`
   - Be careful with breaking changes to config formats
   - Provide migration scripts if needed

### Common Pitfalls to Avoid

1. **Don't** use Electron APIs in Cloud mode without checks
2. **Don't** bypass the storage abstraction (use window.storage)
3. **Don't** make synchronous API calls (always async)
4. **Don't** forget to handle streaming errors
5. **Don't** ignore TypeScript errors (fix them properly)
6. **Don't** create new global state (use existing patterns)
7. **Don't** hardcode API URLs (use API_URL() helper)

### Resources

**Documentation:**
- Main docs: https://transformerlab.ai/docs
- Discord: https://discord.gg/transformerlab
- GitHub Issues: https://github.com/transformerlab/transformerlab-app/issues

**Code Patterns:**
- Study `src/renderer/components/Experiment/Interact/Interact.tsx` for chat patterns
- Study `src/renderer/components/Experiment/Workflows/` for XYFlow usage
- Study `src/renderer/components/Plugins/` for plugin system

**API Reference:**
- OpenAPI spec: `scripts/openapi.json`
- Endpoints: `src/renderer/lib/api-client/endpoints.ts`
- Chat API: `src/renderer/lib/api-client/chat.ts`

---

## Version Information

**Last Updated:** 2025-01-18
**App Version:** 0.23.1
**Node Version Required:** v22 (NOT v23)
**Electron Version:** 26.2.1
**React Version:** 18.2.0

---

## Contact

- **Primary Maintainer:** Ali Asaria (@aliasaria)
- **Contributor:** Tony Salomone (@dadmobile)
- **Organization:** Transformer Lab Inc.
- **Website:** https://transformerlab.ai

---

**Note to AI Assistants:** This document should be considered the primary reference for understanding and working with the Transformer Lab codebase. Always refer to this guide before making architectural decisions or significant changes. When in doubt, follow existing patterns in the codebase and ask for clarification if needed.
