import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertThematicBreak,
  ListsToggle,
  Separator,
  DiffSourceToggleWrapper,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

import { useSWRWithAuth as useSWR } from 'renderer/lib/authContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { authenticatedFetch } from 'renderer/lib/api-client/functions';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext.js';

import Sheet from '@mui/joy/Sheet';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import Typography from '@mui/joy/Typography';

const ASSET_MARKDOWN_PREFIX = 'notes/assets/';

export default function ExperimentNotes() {
  const { experimentInfo } = useExperimentInfo();
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<MDXEditorMethods>(null);

  const experimentId: string = experimentInfo?.id ?? '';

  const { data, mutate } = useSWR(
    experimentId ? chatAPI.Endpoints.Experiment.GetNotes(experimentId) : null,
    fetcher,
  );

  const assetUrlPrefix = experimentId
    ? chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, '')
    : '';

  const inflateMarkdown = useCallback(
    (md: string): string => {
      if (!experimentId) return md;
      return md.replace(
        /(!\[[^\]]*\]\()notes\/assets\/([^)\s]+)(\))/g,
        (_match, pre, filename, post) =>
          `${pre}${chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, filename)}${post}`,
      );
    },
    [experimentId],
  );

  const deflateMarkdown = useCallback(
    (md: string): string => {
      if (!assetUrlPrefix) return md;
      return md.split(assetUrlPrefix).join(ASSET_MARKDOWN_PREFIX);
    },
    [assetUrlPrefix],
  );

  const imageUploadHandler = useCallback(
    async (file: File): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authenticatedFetch(
        chatAPI.Endpoints.Experiment.UploadNoteAsset(experimentId),
        { method: 'POST', body: formData },
      );
      if (!response.ok) {
        throw new Error(`Image upload failed: ${response.status}`);
      }
      const { path } = await response.json();
      const filename = (path as string).replace(ASSET_MARKDOWN_PREFIX, '');
      return chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, filename);
    },
    [experimentId],
  );

  useEffect(() => {
    if (!editorRef.current) return;
    if (data === undefined || isDirtyRef.current) return;
    const md = typeof data === 'string' ? data : '';
    editorRef.current.setMarkdown(inflateMarkdown(md));
  }, [data, inflateMarkdown]);

  async function saveNotes() {
    if (!editorRef.current) return;
    setIsSaving(true);
    try {
      const md = editorRef.current.getMarkdown();
      const toSave = deflateMarkdown(md);
      const response = await authenticatedFetch(
        chatAPI.Endpoints.Experiment.SaveNotes(experimentId),
        {
          method: 'POST',
          body: JSON.stringify(toSave || ' '),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      await mutate();
      setIsDirty(false);
      isDirtyRef.current = false;
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setIsSaving(false);
    }
  }

  if (!experimentInfo?.id) return null;

  return (
    <Sheet
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 2,
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
      >
        <Typography level="h3">Experiment Notes</Typography>
        <Box display="flex" gap={1} alignItems="center">
          {isDirty && (
            <Chip color="warning" size="sm">
              Unsaved changes
            </Chip>
          )}
          <Button
            size="sm"
            color="success"
            onClick={saveNotes}
            loading={isSaving}
            disabled={!isDirty}
          >
            Save
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'neutral.outlinedBorder',
          borderRadius: 'sm',
          '& .mdxeditor': {
            height: '100%',
          },
          '& .mdxeditor-root-contenteditable': {
            minHeight: '100%',
          },
        }}
      >
        <MDXEditor
          ref={editorRef}
          markdown=""
          onChange={() => {
            if (!isDirtyRef.current) {
              setIsDirty(true);
              isDirtyRef.current = true;
            }
          }}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            imagePlugin({ imageUploadHandler }),
            markdownShortcutPlugin(),
            diffSourcePlugin({ viewMode: 'rich-text' }),
            toolbarPlugin({
              toolbarContents: () => (
                <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                  <UndoRedo />
                  <Separator />
                  <BoldItalicUnderlineToggles />
                  <Separator />
                  <BlockTypeSelect />
                  <Separator />
                  <ListsToggle />
                  <Separator />
                  <CreateLink />
                  <InsertImage />
                  <InsertThematicBreak />
                </DiffSourceToggleWrapper>
              ),
            }),
          ]}
        />
      </Box>
    </Sheet>
  );
}
