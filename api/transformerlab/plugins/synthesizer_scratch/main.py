import json
import sys

from deepeval.synthesizer import Evolution, Synthesizer
from deepeval.synthesizer.config import EvolutionConfig, StylingConfig
from transformerlab.sdk.v1.generate import tlab_gen

tlab_gen.add_argument("--num_goldens", default=5, type=int)


def scratch_generation(model, styling_config: dict, evolution_config: dict = None):
    """Generate synthetic data from scratch"""
    # Validate configs
    if not all(
        key in styling_config
        for key in ["input_format", "expected_output_format", "task", "scenario"]
    ):
        raise ValueError(
            "Styling config dictionary must have the keys `input_format`, `expected_output_format`, `task`, `scenario`"
        )

    if evolution_config is not None and not all(
        key in evolution_config for key in ["REASONING", "CONCRETIZING", "CONSTRAINED"]
    ):
        raise ValueError(
            "Evolution config dictionary must have the keys `REASONING`, `CONCRETIZING`, `CONSTRAINED`"
        )

    print("Generating data from scratch...")
    tlab_gen.progress_update(35)

    try:
        # Create StylingConfig
        styling_config = StylingConfig(**styling_config)

        # Create EvolutionConfig
        if not evolution_config:
            evolution_config = EvolutionConfig(
                evolutions={
                    Evolution.REASONING: 1 / 3,
                    Evolution.CONCRETIZING: 1 / 3,
                    Evolution.CONSTRAINED: 1 / 3,
                },
                num_evolutions=3,
            )
        else:
            evolution_config = EvolutionConfig(
                evolutions={
                    Evolution.REASONING: evolution_config["REASONING"],
                    Evolution.CONCRETIZING: evolution_config["CONCRETIZING"],
                    Evolution.CONSTRAINED: evolution_config["CONSTRAINED"],
                },
                num_evolutions=3,
            )

        # Initialize synthesizer
        async_mode = True
        if "local" in tlab_gen.params.get("generation_model", "").lower():
            async_mode = sys.platform != "darwin"
        synthesizer = Synthesizer(
            styling_config=styling_config,
            model=model,
            evolution_config=evolution_config,
            async_mode=async_mode,
        )
        tlab_gen.progress_update(45)
        print("Synthesizer initialized successfully")

        # Generate data
        synthesizer.generate_goldens_from_scratch(num_goldens=tlab_gen.params.num_goldens)
        tlab_gen.progress_update(60)

        # Convert to DataFrame
        df = synthesizer.to_pandas()
        return df

    except Exception as e:
        print(f"An error occurred while generating data from scratch: {e}")
        raise


@tlab_gen.job_wrapper()
def run_generation():
    """Run data generation using Synthesizer"""
    # Setup and initialize

    # Load model
    try:
        trlab_model = tlab_gen.load_evaluation_model(field_name="generation_model")
        print(f"Model loaded successfully: {trlab_model.get_model_name()}")
    except Exception as e:
        print(f"An error occurred while loading the model: {e}")
        raise

    tlab_gen.progress_update(20)

    # Check required parameters
    if (
        not tlab_gen.params.input_format
        or not tlab_gen.params.expected_output_format
        or not tlab_gen.params.task
        or not tlab_gen.params.scenario
    ):
        raise ValueError(
            "Input format, expected output format, task and scenario must be provided for generation."
        )

    # Create styling config
    styling_config = {
        "input_format": tlab_gen.params.input_format,
        "expected_output_format": tlab_gen.params.expected_output_format,
        "task": tlab_gen.params.task,
        "scenario": tlab_gen.params.scenario,
    }

    # Parse evolution config if provided
    evolution_config = None
    if tlab_gen.params.evolution_config is not None:
        try:
            evolution_config = json.loads(tlab_gen.params.evolution_config)
        except json.JSONDecodeError:
            print("Warning: Invalid JSON in evolution_config, using default")

    tlab_gen.progress_update(30)

    # Call synthesizer function
    df = scratch_generation(trlab_model, styling_config, evolution_config)

    tlab_gen.progress_update(70)

    # Generate expected outputs if requested
    if tlab_gen.params.get("generate_expected_output", "Yes").lower() == "yes":
        input_values = df["input"].tolist()
        expected_outputs = tlab_gen.generate_expected_outputs(
            input_values,
            styling_config["task"],
            styling_config["scenario"],
            styling_config["input_format"],
            styling_config["expected_output_format"],
        )
        df["expected_output"] = expected_outputs

    # Rename columns for consistency
    df.rename(columns={"actual_output": "output"}, inplace=True)

    tlab_gen.progress_update(90)

    # Save the generated outputs as a dataset
    custom_name = tlab_gen.params.get("output_dataset_name")
    additional_metadata = {"styling_config": styling_config, "evolution_config": evolution_config}
    output_file, dataset_name = tlab_gen.save_generated_dataset(
        df, additional_metadata, dataset_id=custom_name
    )

    tlab_gen.progress_update(100)
    print(f"Data generated successfully as dataset {dataset_name}")

    return True


print("Running generation...")
run_generation()
