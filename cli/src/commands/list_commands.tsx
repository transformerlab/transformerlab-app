import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import Table from 'ink-table';
import { api } from '../api';
import { Loading, ErrorMsg } from '../ui';

const truncate = (str: string, length: number = 30) => {
  if (!str) return '';
  if (str.length <= length) return str;
  return `${str.slice(0, length - 3)}...`;
};

export const GenericList = ({
  fetcher,
  columns,
  labelMap,
  noTruncate,
}: {
  fetcher: () => Promise<any>;
  columns?: string[];
  labelMap?: Record<string, string>;
  noTruncate?: string[];
}) => {
  const { exit } = useApp();
  const [data, setData] = useState<any[] | null>(null);
  const [error, setError] = useState<{
    message: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    fetcher()
      .then((res) => {
        let list = [];
        if (Array.isArray(res)) list = res;
        else if (res && res.data && Array.isArray(res.data)) list = res.data;
        else if (res && res.jobs && Array.isArray(res.jobs)) list = res.jobs;
        else if (res && res.teams && Array.isArray(res.teams)) list = res.teams;
        else if (res && res.models && Array.isArray(res.models))
          list = res.models;

        setData(list);
        exit();
      })
      .catch((e) => {
        setError(api.handleError(e));
        exit();
      });
  }, [exit, fetcher]);

  if (error) return <ErrorMsg text={error.message} detail={error.detail} />;
  if (!data) return <Loading text="Fetching data..." />;
  if (data.length === 0) return <Text italic>No items found.</Text>;

  const tableData = data.map((item) => {
    const row: any = {};

    const keysToUse = columns || Object.keys(item);

    keysToUse.forEach((key) => {
      let val = item[key];

      if (typeof val === 'object' && val !== null) {
        if (val.name) val = val.name;
        else val = JSON.stringify(val);
      }

      if (typeof val === 'string') {
        if (!noTruncate || !noTruncate.includes(key)) {
          val = truncate(val);
        }
      }

      const label = labelMap && labelMap[key] ? labelMap[key] : key;
      row[label] = val;
    });

    return row;
  });

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Table data={tableData} />
      <Box marginTop={1}>
        <Text dimColor>Total: {data.length} items</Text>
      </Box>
    </Box>
  );
};
