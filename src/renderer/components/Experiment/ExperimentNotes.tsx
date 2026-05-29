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
  codeBlockPlugin,
  codeMirrorPlugin,
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
import IconButton from '@mui/joy/IconButton';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Typography from '@mui/joy/Typography';
import { Share2Icon } from 'lucide-react';
import PublicShareLinkPopover from './PublicShareLinkPopover';

const ASSET_MARKDOWN_PREFIX = 'notes/assets/';

export default function ExperimentNotes() {
  const { experimentInfo } = useExperimentInfo();
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const editorRef = useRef<MDXEditorMethods>(null);

  const experimentId: string = experimentInfo?.id ?? '';

  const { data, mutate } = useSWR(
    experimentId ? chatAPI.Endpoints.Experiment.GetNotes(experimentId) : null,
    fetcher,
  );

  const assetUrlPrefix = experimentId
    ? chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, '')
    : '';

  const getAssetPathPrefix = useCallback((prefix: string): string => {
    if (!prefix) return '';
    try {
      return new URL(prefix).pathname;
    } catch {
      try {
        return new URL(prefix, window.location.origin).pathname;
      } catch {
        return '';
      }
    }
  }, []);

  const escapeForRegex = useCallback((value: string): string => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }, []);

  const inflateMarkdown = useCallback(
    (md: string): string => {
      if (!experimentId) return md;
      // Handle canonical stored format: ![...](notes/assets/<filename>)
      let result = md.replace(
        /(!\[[^\]]*\]\()notes\/assets\/([^)\s]+)(\))/g,
        (_match, pre, filename, post) =>
          `${pre}${chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, filename)}${post}`,
      );
      // Backward-compat: convert previously persisted absolute/path API asset URLs
      // into the current API base so host changes do not break note images.
      result = result.replace(
        /(!\[[^\]]*\]\()((?:https?:\/\/[^)\s]+)?\/experiment\/[^)\s]+\/notes\/assets\/([^)\s]+))(\))/g,
        (_match, pre, _full, filename, post) =>
          `${pre}${chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, filename)}${post}`,
      );
      // Backward-compat: repair malformed URLs produced by buggy deflation
      // (e.g. http://hostnotes/assets/<filename>).
      result = result.replace(
        /(!\[[^\]]*\]\()https?:\/\/[^)\s]*notes\/assets\/([^)\s]+)(\))/g,
        (_match, pre, filename, post) =>
          `${pre}${chatAPI.Endpoints.Experiment.GetNoteAsset(experimentId, filename)}${post}`,
      );
      // MDXEditor parses markdown through MDX. A raw `<` that does not begin a valid
      // HTML/JSX tag (e.g. `R_OOC<0.9`, `<=2`, `5 < 10`) is interpreted as a malformed
      // tag start and fails rich-text parsing with "Unexpected character ... before name".
      // Escape any `<` not followed by a letter, `/` (closing tag), or `!` (comment/doctype)
      // so comparison operators and the like render literally.
      result = result.replace(/<(?![A-Za-z/!])/g, '&lt;');
      return result;
    },
    [experimentId],
  );

  const deflateMarkdown = useCallback(
    (md: string): string => {
      if (!assetUrlPrefix) return md;
      const pathPrefix = getAssetPathPrefix(assetUrlPrefix);

      let result = md;
      if (pathPrefix) {
        const escapedPathPrefix = escapeForRegex(pathPrefix);
        // Convert both absolute and path-only asset URLs to canonical relative markdown.
        result = result.replace(
          new RegExp(
            `(!\\[[^\\]]*\\]\\()(?:(?:https?:\\/\\/[^)\\s]+)?)${escapedPathPrefix}([^)\\s]+)(\\))`,
            'g',
          ),
          (_match, pre, filename, post) =>
            `${pre}${ASSET_MARKDOWN_PREFIX}${filename}${post}`,
        );
      }
      return result;
    },
    [assetUrlPrefix, escapeForRegex, getAssetPathPrefix],
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
          <IconButton
            size="sm"
            variant="outlined"
            onClick={() => setShareOpen(true)}
            title="Public share link"
          >
            <Share2Icon size={14} />
          </IconButton>
        </Box>
      </Box>
      <Modal open={shareOpen} onClose={() => setShareOpen(false)}>
        <ModalDialog sx={{ minWidth: 400 }}>
          <ModalClose />
          <PublicShareLinkPopover experimentId={experimentId} kind="notes" />
        </ModalDialog>
      </Modal>

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
            codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
            codeMirrorPlugin({
              codeBlockLanguages: {
                text: 'Plain Text',
                json: 'JSON',
                python: 'Python',
                bash: 'Bash',
                shell: 'Shell',
                yaml: 'YAML',
                ts: 'TypeScript',
                tsx: 'TSX',
                js: 'JavaScript',
                jsx: 'JSX',
                md: 'Markdown',
                '': 'Plain Text',
              },
            }),
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
