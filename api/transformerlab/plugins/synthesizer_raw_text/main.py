import sys
import traceback

from deepeval.synthesizer import Synthesizer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from transformerlab.sdk.v1.generate import tlab_gen

# Add custom arguments specific to the synthesizer plugin
tlab_gen.add_argument(
    "--num_goldens", default=5, type=int, help="Number of golden examples to generate"
)


def context_generation(context: str, model, num_goldens: int):
    """Generate data from context using the Synthesizer"""
    print("Splitting context into sentences...")
    # Break the context into sentences
    splitter = RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", ". ", " ", ""], chunk_size=256, chunk_overlap=0
    )
    sentences = splitter.split_text(context)
    sentences = [[sentence] for sentence in sentences]
    print(f"Number of sentences in the context: {len(sentences)}")

    tlab_gen.progress_update(20)

    # Generate goldens from contexts
    print("Generating data from contexts...")
    try:
        async_mode = True
        if "local" in tlab_gen.params.get("generation_model", "").lower():
            async_mode = sys.platform != "darwin"
        synthesizer = Synthesizer(model=model, async_mode=async_mode)
        print("Synthesizer initialized successfully")
        tlab_gen.progress_update(30)

        max_goldens_per_context = num_goldens // max(len(sentences), 1)
        synthesizer.generate_goldens_from_contexts(
            contexts=sentences,
            max_goldens_per_context=max(max_goldens_per_context, 2),
            include_expected_output=True,
        )
        tlab_gen.progress_update(80)

        # Convert the generated data to a pandas dataframe
        df = synthesizer.to_pandas()

        # Rename the column `actual_output` to `output` for consistency
        if "actual_output" in df.columns:
            df.rename(columns={"actual_output": "output"}, inplace=True)

        return df

    except Exception as e:
        print(f"An error occurred while generating data from context: {e}")
        traceback.print_exc()
        raise


@tlab_gen.job_wrapper(progress_start=0, progress_end=100)
def run_generation():
    """Main function to run the synthesizer plugin"""
    print(f"Generation type: {tlab_gen.params.generation_type}")
    print(f"Model Name: {tlab_gen.params.generation_model}")

    # Check for context
    if not tlab_gen.params.context or len(tlab_gen.params.context.strip()) <= 1:
        print("Context must be provided for generation.")
        raise ValueError("Context must be provided for generation.")

    # Load the model for generation using tlab_gen helper
    trlab_model = tlab_gen.load_evaluation_model()

    print("Model loaded successfully")
    tlab_gen.progress_update(10)

    # Generate data from context
    df = context_generation(
        tlab_gen.params.context, trlab_model, tlab_gen.params.get("num_goldens", 5)
    )

    # Save the generated outputs as a dataset
    custom_name = tlab_gen.params.get("output_dataset_name")
    output_file, dataset_name = tlab_gen.save_generated_dataset(
        df,
        {
            "generation_method": "context",
            "num_goldens": tlab_gen.params.get("num_goldens", 5),
        },
        dataset_id=custom_name,
    )

    print(f"Data generated successfully as dataset {dataset_name}")
    print(f"Saved to {output_file}")

    return df


run_generation()
