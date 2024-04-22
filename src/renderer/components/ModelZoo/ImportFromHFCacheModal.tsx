import { 
    Button, 
    FormControl,
    FormLabel,
    Modal, 
    ModalClose, 
    ModalDialog, 
    Stack,
    Table,
    Typography
} from '@mui/joy';

import {
    ArrowRightFromLineIcon,
} from 'lucide-react';

export default function ImportFromHFCacheModal({ open, setOpen}) {
    const models = [
        {
            "id":"test-model"
        }
    ];

    return (
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
            <ModalClose />
            <Typography level="h2">Import:</Typography>
            <form
            id="import-hfcache-form"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                justifyContent: 'space-between',
            }}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form_data = new FormData(event.currentTarget);
                const form_json = Object.fromEntries((form_data as any).entries());

                //onSubmit(plugin.uniqueId, plugin.export_architecture, JSON.stringify(form_json));
                alert(JSON.stringify(form_json));
                setOpen(false);
            }}
            >

            <Table
                aria-labelledby="tableTitle"
                stickyHeader
                hoverRow
                sx={{
                    '--TableCell-headBackground': (theme) =>
                    theme.vars.palette.background.level1,
                    '--Table-headerUnderlineThickness': '1px',
                    '--TableRow-hoverBackground': (theme) =>
                    theme.vars.palette.background.level1,
                    height: '100px',
                    overflow: 'auto',
                }}
              >
              <thead>
                <tr>
                  <th style={{ width: 120, padding: 12 }}> </th>
                  <th style={{ width: 120, padding: 12 }}>Model ID</th>
                  <th style={{ width: 120, padding: 12 }}>Architecture</th>
                  <th style={{ width: 120, padding: 12 }}>Supported</th>
                  <th style={{ width: 160, padding: 12 }}> </th>
                </tr>
              </thead>
              <tbody>
                {models.map((row) => (
                <tr key={row.rowid}>
                  <td>
                    <Typography ml={2} fontWeight="lg"> </Typography>
                  </td>
                  <td>
                    <Typography ml={2} fontWeight="lg">{row.id}</Typography>
                  </td>
                  <td>
                    <Typography ml={2} fontWeight="lg">{} </Typography>
                  </td>
                  <td>
                    <Typography ml={2} fontWeight="lg"> </Typography>
                  </td>
                  <td>
                    <Typography ml={2} fontWeight="lg"> </Typography>
                  </td>
                </tr>
              ))}
            {models?.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Typography
                    level="body-lg"
                    justifyContent="center"
                    margin={5}
                  >
                    No new models found.
                  </Typography>
                </td>
              </tr>
            )}
          </tbody>
        </Table>

            <Stack spacing={2} direction="row" justifyContent="flex-end">
                <Button color="danger" variant="soft" onClick={() => setOpen(false)}>
                Cancel
                </Button>
                <Button
                    variant="soft"
                    type="submit"
                    disabled={models.length==0}
                    startDecorator={<ArrowRightFromLineIcon />}>
                Import
                </Button>
            </Stack>

            </form>
        </ModalDialog>
      </Modal>
    )
}