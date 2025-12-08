import pandas as pd
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from transformerlab.services.job_service import job_get

router = APIRouter(prefix="/evals", tags=["evals"])


# @router.get("/list")
# async def eval_local_list():
#     """Get the list of local evals"""
#     eval_plugins = await db.get_plugins_of_type("EVALUATION")

#     result = []

#     # for each eval_plugin, check if it has saved local files:
#     for eval_plugin in eval_plugins:
#         name = eval_plugin["name"]
#         info_file = f"{dirs.plugin_dir_by_name(name)}/index.json"
#         print(info_file)
#         info = {}
#         # check if info_file exists:
#         if os.path.exists(info_file):
#             print("info_file exists")
#             with open(info_file, "r") as f:
#                 info = json.load(f)
#         else:
#             print("info_file does not exist")

#         result.append({"name": name, "info": info})

#     return result


@router.get("/compare_evals")
async def compare_eval(job_list: str = ""):
    """Compare the output of evaluations from a list of job_ids.

    Expects job_list to be an array of job_ids.
    """
    try:
        additional_output_paths = {}
        job_list = job_list.split(",")

        for job_id in job_list:
            job = job_get(job_id)
            job_data = job.get("job_data", {})
            evaluator_name = job_data.get("evaluator", "")
            plugin_name = job_data.get("plugin", "")

            if "additional_output_path" in job_data:
                additional_output_paths[job_id] = {}
                additional_output_paths[job_id]["file_path"] = job_data["additional_output_path"]

                if job_data["additional_output_path"].endswith(".csv"):
                    df = pd.read_csv(job_data["additional_output_path"])
                    df["job_id"] = job_id
                    df["evaluator_name"] = evaluator_name
                    df["plugin_name"] = plugin_name
                    additional_output_paths[job_id]["data"] = df

                else:
                    additional_output_paths[job_id]["data"] = None

        # Combine additional outputs into a single dataframe for comparison
        combined = pd.DataFrame()
        for job_id, output in additional_output_paths.items():
            if output["data"] is not None:
                df = output["data"].copy()

                # Handle column alignment before concatenation
                if not combined.empty:
                    # Add missing columns to the current dataframe
                    for col in combined.columns:
                        if col not in df.columns:
                            df[col] = None

                    # Add missing columns to the combined dataframe
                    for col in df.columns:
                        if col not in combined.columns:
                            combined[col] = None

                # Concatenate without triggering the warning
                combined = pd.concat([combined, df], ignore_index=True)

        return JSONResponse(
            content=combined.to_json(orient="records"), media_type="application/json"
        )

    except Exception:
        print("An error occurred while comparing evaluations")
        return {"error": "An internal error has occurred. Please try again later."}
