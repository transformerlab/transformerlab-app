import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

import { 
    Button,
    Modal,
    ModalClose,
    ModalDialog,
    Typography
} from '@mui/joy';

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

    return (
        <Modal open={(modelId != null)} onClose={() => setModelId(null)}>
          <ModalDialog>
            <ModalClose />
            <Typography level="h3">{modelData?.uniqueID}</Typography>
            <Typography>
                {JSON.stringify(modelData)}
            </Typography>
        </ModalDialog>
      </Modal>
    )
}