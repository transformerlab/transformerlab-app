import { useEffect, useState } from 'react';
import {
  Button,
  Table,
  CircularProgress,
  Box,
  IconButton,
  iconButtonClasses,
  Alert,
  Select,
  Option,
  FormControl,
  FormLabel,
  LinearProgress,
  Typography,
  Skeleton,
  Tooltip,
} from '@mui/joy';

import * as chatAPI from '../../lib/transformerlab-api-sdk';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import useSWR from 'swr';
const fetcher = (url) =>
  fetch(url)
    .then((res) => res.json())
    .then((data) => data);

const DatasetTable = ({ datasetId }) => {
  const [pageNumber, setPageNumber] = useState(1);
  const [numOfPages, setNumOfPages] = useState(1);
  const [datasetLen, setDatasetLen] = useState(null);
  let pageSize = 10; //Set the number of rows per page
  const offset = (pageNumber - 1) * pageSize; //Calculate current row number to start from

  const [split, setSplit] = useState(''); //Set the default split to display
  const [showingSplit, setShowingSplit] = useState(''); // We use this to show the user what split is shown without triggering a re-call of the data

  //Set the pagination for the dataset
  const setPagination = (totalRows, rowsPerPage) => {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    setNumOfPages(totalPages);
  };
  const { data, error, isLoading, mutate } = useSWR(
    chatAPI.Endpoints.Dataset.Preview(datasetId, split, offset, pageSize),
    fetcher
  );

  useEffect(() => {
    setDatasetLen(null);
    setPageNumber(1);
    setNumOfPages(1);
  }, [datasetId]);

  useEffect(() => {
    if (data && data.data && datasetLen === null) {
      setDatasetLen(data.data['len']);
      setPagination(data.data['len'], pageSize);
    }

    // set the split in the UI if no split is set:
    if (data && data.data && split === '') {
      setShowingSplit(data.data?.['splits'][0]);
    }
  }, [data, pageSize, datasetLen]);
  return (
    <>
      {data?.data?.['splits'] ? (
        <FormControl
          sx={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}
        >
          <Typography level="title-md">Split:</Typography>
          <Select
            value={split == '' ? showingSplit : split}
            sx={{ minWidth: '200px' }}
            onChange={(e, newValue) => {
              if (!newValue) return;

              setSplit(newValue);
              setPageNumber(1);
              setNumOfPages(1);
              setDatasetLen(null);
              mutate();
            }}
          >
            {data.data['splits'].map((split) => (
              <Option key={split} value={split}>
                {split}
              </Option>
            ))}
          </Select>
          <Typography level="body-sm" color="neutral">
            Total rows in this split: {datasetLen}
          </Typography>
        </FormControl>
      ) : (
        <Skeleton
          variant="rectangular"
          width={200}
          height="3em"
          sx={{ mb: 2 }}
          loading={isLoading}
        />
      )}
      <Box sx={{ overflow: 'auto', height: '100%' }}>
        {isLoading && (
          <>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton
                key={index}
                variant="rectangular"
                width="100%"
                height="2em"
                sx={{ mb: 1 }}
                loading={isLoading}
              />
            ))}
          </>
        )}
        {data?.status == 'error' && (
          <Alert color="danger">{data?.message}</Alert>
        )}
        {/* {JSON.stringify(data)} */}
        {data &&
          data?.data?.['columns'] && ( //Data is loaded as a map of column names to arrays of values
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
                    data.data['columns'][Object.keys(data.data['columns'])[0]]
                      .length,
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
                        <Tooltip
                          title={
                            typeof data.data['columns'][key][rowIndex] ===
                            'string'
                              ? data.data['columns'][key][rowIndex]
                              : JSON.stringify(
                                  data.data['columns'][key][rowIndex]
                                )
                          }
                          sx={{ maxWidth: '400px' }}
                          arrow
                          variant="solid"
                          color="primary"
                        >
                          <div
                            style={{
                              maxHeight: '150px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {typeof data.data['columns'][key][rowIndex] ===
                            'string'
                              ? data.data['columns'][key][rowIndex]
                              : JSON.stringify(
                                  data.data['columns'][key][rowIndex]
                                )}
                          </div>
                        </Tooltip>
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
            variant={Number(numOfPages) === pageNumber ? 'outlined' : 'plain'}
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
    </>
  );
};

export default DatasetTable;
