import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import { 
    Button,
    Modal,
    ModalClose,
    ModalDialog,
    Typography
} from '@mui/joy';

import {
    formatBytes,
} from '../../lib/utils';

// fetcher used by SWR
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ImportModelsModal({ modelId, setModelId }) {

    const {
        data: modelData,
        error: modelError,
        isLoading: isLoading,
    } = useSWR(
        (modelId == null) ? null : chatAPI.Endpoints.Models.ModelDetailsFromGallery(modelId),
        fetcher
    );
    console.log(modelData);

    return (
        <Modal open={(modelId != null)} onClose={() => setModelId(null)}>
          <ModalDialog>
            <ModalClose />
            <Typography level="h3">{modelData?.uniqueID}</Typography>
            <Typography>
                {modelData?.description}
            </Typography>
            <Typography>
                <b>Parameters:</b>
                {modelData?.parameters}
            </Typography>
            <Typography>
                <b>Size:</b>
                {modelData?.size_of_model_in_mb &&
                    formatBytes(modelData?.size_of_model_in_mb * 1024 * 1024)}
            </Typography>
            <Typography>
                <b>Architecture:</b>
                {modelData?.architecture}
            </Typography>
            <Typography>
                <b>License:</b>
                {modelData?.license}
            </Typography>
        </ModalDialog>
      </Modal>
    )
}