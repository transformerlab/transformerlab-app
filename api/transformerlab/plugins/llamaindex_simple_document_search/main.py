import argparse
import json
import sys
import time

from lab import storage
from llama_index.core import (
    Settings,
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.core.callbacks import CallbackManager, CBEventType, LlamaDebugHandler
from llama_index.core.postprocessor import SentenceTransformerRerank
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai_like import OpenAILike


# Context manager to redirect all stdout to stderr to prevent interference with JSON output
class RedirectStdoutToStderr:
    def __enter__(self):
        self.original_stdout = sys.stdout
        sys.stdout = sys.stderr
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self.original_stdout


def index_documents(documents_dir, persistency_dir, embedding_model="BAAI/bge-small-en-v1.5"):
    # Redirect stdout to stderr to prevent any output from this function
    with RedirectStdoutToStderr():
        markitdown_dir = storage.join(documents_dir, ".tlab_markitdown")
        if storage.exists(markitdown_dir):
            sys.stderr.write("Markitdown detected, using that directory for indexing instead")
            documents_dir = markitdown_dir
        reader = SimpleDirectoryReader(input_dir=documents_dir, exclude_hidden=False)
        documents = reader.load_data()
        sys.stderr.write(f"Loaded {len(documents)} docs")

        Settings.embed_model = HuggingFaceEmbedding(
            model_name=embedding_model, trust_remote_code=True
        )

        vector_index = VectorStoreIndex.from_documents(
            documents,
            required_exts=[
                ".txt",
                ".pdf",
                ".docx",
                ".csv",
                ".epub",
                ".ipynb",
                ".mbox",
                ".md",
                ".ppt",
                ".pptm",
                ".pptx",
            ],
        )

        vector_index.storage_context.persist(persist_dir=persistency_dir)


def main():
    # Redirect all stdout to stderr to prevent any accidental prints from interfering with JSON output
    with RedirectStdoutToStderr():
        parser = argparse.ArgumentParser()
        parser.add_argument("--model_name", type=str, required=True)
        parser.add_argument(
            "--embedding_model", default="BAAI/bge-small-en-v1.5", type=str, required=False
        )
        parser.add_argument("--documents_dir", default="", type=str, required=True)
        parser.add_argument("--settings", default="", type=str, required=False)

        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--query", default="", type=str)
        group.add_argument("--index", default=False, type=bool)

        args, unknown = parser.parse_known_args()

        continue_after_index = False

        documents_dir = args.documents_dir
        persistency_dir = storage.join(documents_dir, "persist")

        if not storage.exists(persistency_dir) and not args.index:
            sys.stderr.write("Documents have not been indexed. Indexing them first")
            args.index = True
            continue_after_index = True

        if args.index:
            start_time = time.time()
            index_documents(documents_dir, persistency_dir, args.embedding_model)
            elapsed_time = time.time() - start_time

            result = {"status": "success", "elapsed_time": elapsed_time}
            sys.stderr.write(json.dumps(result))
            if not continue_after_index:
                sys.stderr.write("Indexing complete. Exiting.")
                return

        # SETTINGS
        number_of_search_results = 2
        use_reranker = False
        reranker_model = "cross-encoder/ms-marco-MiniLM-L-6-v2"
        reranker_top_n = 20

        Settings.context_window = 2048
        Settings.num_output = 256

        Settings.chunk_size = 256
        Settings.chunk_overlap = 50

        response_mode = "compact"

        temperature = 0.7
        # END SETTINGS

        if args.settings:
            try:
                settings_param = json.loads(args.settings)
            except json.JSONDecodeError as e:
                print(f"Error decoding settings JSON: {e}", file=sys.stderr)
                settings_param = {}
            if "number_of_search_results" in settings_param:
                number_of_search_results = int(settings_param["number_of_search_results"])
            if "context_window" in settings_param:
                Settings.context_window = int(settings_param["context_window"])
            if "num_output" in settings_param:
                Settings.num_output = int(settings_param["num_output"])
            if "chunk_size" in settings_param:
                Settings.chunk_size = int(settings_param["chunk_size"])
            if "chunk_overlap" in settings_param:
                Settings.chunk_overlap = int(settings_param["chunk_overlap"])
            if "response_mode" in settings_param:
                response_mode = settings_param["response_mode"]
            if "temperature" in settings_param:
                temperature = float(settings_param["temperature"])
            if "use_reranker" in settings_param:
                use_reranker = bool(settings_param["use_reranker"])
            if "reranker_model" in settings_param:
                reranker_model = settings_param["reranker_model"]
            if "reranker_top_n" in settings_param:
                reranker_top_n = int(settings_param["reranker_top_n"])

        print(f"Settings: {Settings.__dict__}", file=sys.stderr)

        llama_debug = LlamaDebugHandler(print_trace_on_end=False)
        callback_manager = CallbackManager([llama_debug])

        # We must do exclude_hidden because ~.transformerlab has a . in its name
        reader = SimpleDirectoryReader(input_dir=args.documents_dir, exclude_hidden=False)
        documents = reader.load_data()
        sys.stderr.write(f"Loaded {len(documents)} docs")

        model_short_name = args.model_name.split("/")[-1]

        llm = OpenAILike(
            api_key="fake",
            api_type="fake",
            api_base="http://localhost:8338/v1",
            model=model_short_name,
            is_chat_model=True,
            timeout=40,
            context_window=Settings.context_window,
            tokenizer=model_short_name,
            temperature=temperature,
        )

        Settings.llm = llm

        Settings.embed_model = HuggingFaceEmbedding(
            model_name=args.embedding_model, trust_remote_code=True
        )
        Settings.callback_manager = callback_manager

        storage_context = StorageContext.from_defaults(persist_dir=persistency_dir)
        vector_index = load_index_from_storage(storage_context)

        # Configure reranker if enabled
        node_postprocessors = []
        if use_reranker:
            print(f"Using reranker: {reranker_model}", file=sys.stderr)
            reranker = SentenceTransformerRerank(model=reranker_model, top_n=reranker_top_n)
            node_postprocessors.append(reranker)

        query_engine = vector_index.as_query_engine(
            response_mode=response_mode,
            similarity_top_k=number_of_search_results,
            node_postprocessors=node_postprocessors,
        )

        rag_response = query_engine.query(args.query)

        script_response = {}
        script_response["response"] = rag_response.__str__()

        # events = llama_debug.get_events()
        event_pairs = llama_debug.get_event_pairs()

        for event_pair in event_pairs:
            if event_pair[0].event_type == CBEventType.RETRIEVE:
                script_response["context"] = []
                nodes = event_pair[1].payload.get("nodes")
                for node in nodes:
                    script_response["context"].append(node.__str__())

            if event_pair[0].event_type == CBEventType.TEMPLATING:
                script_response["template"] = event_pair[0].payload["template"].__str__()

    # Print the final JSON response to stdout (outside the redirect context)
    print(json.dumps(script_response))


if __name__ == "__main__":
    main()
