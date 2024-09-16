import {
  Button,
  IconButton,
  List,
  ListDivider,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Sheet,
  Typography,
} from '@mui/joy';
import { MessagesSquareIcon, XIcon } from 'lucide-react';

import * as chatAPI from '../../../lib/transformerlab-api-sdk';

function truncate(str, n) {
  if (!str) return '';

  return str.length > n ? <>{str.slice(0, n - 1)} &hellip;</> : <>{str}</>;
}

export default function PreviousMessageList({
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfo,
  visibility = 'visible',
}) {
  return (
    <Sheet
      sx={{
        display: 'flex',
        flex: '2',
        paddingBottom: 0,
        // border: '4px solid red',
        flexDirection: 'column',
        overflow: 'hidden',
        justifyContent: 'flex-end',
        visibility: visibility,
      }}
    >
      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          width: '100%',
        }}
        variant="outlined"
      >
        <List>
          {conversationsIsLoading && <div>Loading...</div>}
          {conversations &&
            conversations?.map((c) => (
              <div key={c?.id}>
                <ListItem>
                  <ListItemButton
                    onClick={() => {
                      setChats(c?.contents);
                      setConversationId(c?.id);
                    }}
                    selected={conversationId === c?.id}
                  >
                    <ListItemDecorator>
                      <MessagesSquareIcon
                        size="18px"
                        color="var(--joy-palette-neutral-500)"
                        strokeWidth={1}
                      />
                    </ListItemDecorator>
                    <ListItemContent>
                      <Typography level="body-sm" color="neutral">
                        {truncate(c?.contents?.[0]?.t, 20)}
                      </Typography>
                      {/* <Typography level="body-sm">
          {c?.contents?.length > 0 &&
            shortenArray(c?.contents, 3).map((m) => {
              return (
                <>
                  {m?.user == 'human' ? 'User' : 'Bot'}:
                  &nbsp;
                  {truncate(m?.t, 20)}
                  <br />
                </>
              );
            })}
        </Typography> */}
                    </ListItemContent>
                    <IconButton
                      onClick={() => {
                        fetch(
                          chatAPI.Endpoints.Experiment.DeleteConversation(
                            experimentInfo?.id,
                            c?.id
                          ),
                          {
                            method: 'DELETE',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                          }
                        ).then((response) => {
                          conversationsMutate();
                        });
                      }}
                    >
                      <XIcon
                        strokeWidth={1}
                        color="var(--joy-palette-neutral-500)"
                        size="18px"
                      />
                    </IconButton>
                  </ListItemButton>
                </ListItem>
                <ListDivider />
              </div>
            ))}
        </List>
      </Sheet>
      <Button
        variant="soft"
        onClick={() => {
          setChats([]);
          setConversationId(null);
          conversationsMutate();
        }}
      >
        New Conversation
      </Button>
    </Sheet>
  );
}
