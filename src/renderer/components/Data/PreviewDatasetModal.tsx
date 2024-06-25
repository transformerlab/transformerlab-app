/* eslint-disable camelcase */
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Button,
  Divider,
  Table,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
  CircularProgress,
  Box,
  IconButton,
} from '@mui/joy';
import { iconButtonClasses } from '@mui/joy/IconButton';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((data) => data);

export default function PreviewDatasetModal({ dataset_id, open, setOpen }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [numOfPages, setNumOfPages] = useState(1);
  const [datasetLen, setDatasetLen] = useState(null);
  let pageSize = 10; //Set the number of rows per page
  const offset = (pageNumber - 1) * pageSize; //Calculate current row number to start from
  //Set the pagination for the dataset
  const setPagination = (totalRows, rowsPerPage) => {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    setNumOfPages(totalPages);
  };
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.Preview(dataset_id, offset, pageSize),
    fetcher
  );
  useEffect(() => {
    if (data && data.data && datasetLen === null) {
      setDatasetLen(data.data['len']);
      setPagination(data.data['len'], pageSize);
    }
  }, [data, pageSize, datasetLen]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setOpen(false);
      }}
    >
      <ModalDialog>
        <ModalClose />
        <Typography level="h4">
          Preview <b>{dataset_id}</b>
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Sheet
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'hidden',
            width: '80vw',
            height: '80vh',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ overflow: 'auto', height: '100%' }}>
            {isLoading && <CircularProgress />}
            {data &&
              data.data['columns'] && ( //Data is loaded as a map of column names to arrays of values
                <Table sx={{ tableLayout: 'auto', overflow: 'scroll' }}>
                  <thead>
                    <tr>
                      {Object.keys(data.data['columns']).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({
                      length:
                        data.data['columns'][
                          Object.keys(data.data['columns'])[0]
                        ].length,
                    }).map((_, rowIndex) => (
                      <tr key={rowIndex}>
                        {Object.keys(data.data['columns']).map((key) => (
                          <td
                            key={key}
                            style={{
                              whiteSpace: 'pre-line',
                              verticalAlign: 'top',
                            }}
                          >
                            {typeof data.data['columns'][key][rowIndex] ===
                            'string'
                              ? data.data['columns'][key][rowIndex]
                              : JSON.stringify(
                                  data.data['columns'][key][rowIndex]
                                )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}{' '}
          </Box>
          <Box
            className="Pagination"
            sx={{
              pt: 2,
              gap: 1,
              [`& .${iconButtonClasses.root}`]: { borderRadius: '50%' },
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {pageNumber > 1 ? (
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={() => setPageNumber(pageNumber - 1)}
              >
                <ChevronLeftIcon /> Previous
              </Button>
            ) : (
              <div style={{ width: '78px', height: '30px' }} />
            )}
            <Box sx={{ flex: 1, alignItems: 'center' }} />
            <IconButton
              key={1}
              size="sm"
              variant={Number(1) === pageNumber ? 'outlined' : 'plain'}
              color="neutral"
              onClick={() => setPageNumber(Number(1))}
            >
              {1}
            </IconButton>
            {pageNumber > 4 ? '…' : <div />}
            {Array.from(
              { length: Math.min(5, numOfPages) },
              (_, i) => pageNumber + i - 2
            )
              .filter((page) => page >= 2 && page < numOfPages)

              .map((page) => (
                <IconButton
                  key={page}
                  size="sm"
                  variant={page === pageNumber ? 'outlined' : 'plain'}
                  color="neutral"
                  onClick={() => setPageNumber(Number(page))}
                >
                  {page}
                </IconButton>
              ))}
            {pageNumber < numOfPages - 4 ? '…' : <div />}
            {numOfPages != 1 && (
              <IconButton
                key={numOfPages}
                size="sm"
                variant={
                  Number(numOfPages) === pageNumber ? 'outlined' : 'plain'
                }
                color="neutral"
                onClick={() => setPageNumber(Number(numOfPages))}
              >
                {numOfPages}
              </IconButton>
            )}
            <Box sx={{ flex: 1 }} />
            {pageNumber < numOfPages ? (
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={() => setPageNumber(pageNumber + 1)}
              >
                Next <ChevronRightIcon />
              </Button>
            ) : (
              <div style={{ width: '78px', height: '30px' }} />
            )}
          </Box>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
