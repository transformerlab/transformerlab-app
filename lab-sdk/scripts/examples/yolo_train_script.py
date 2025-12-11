#!/usr/bin/env python3
"""
YOLO training script using Ultralytics YOLO to demonstrate lab SDK integration
for object detection model training.
"""

import os
import argparse
import json
from datetime import datetime
from pathlib import Path

from lab import lab


def train_yolo(quick_test=True):
    """
    Training function using Ultralytics YOLO with lab SDK integration.

    Args:
        quick_test (bool): If True, runs a quick training demo with fewer epochs.
                          If False, runs full training.
    """

    # Configure GPU usage
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

    # Training configuration
    training_config = {
        "model_name": "yolov8n.pt",  # YOLOv8 nano model for faster training
        "dataset": "coco8",  # Small built-in dataset for demo (8 images from COCO)
        "task": "detect",  # Object detection task
        "output_dir": "./yolo_output",
        "quick_test": quick_test,
        "_config": {
            "epochs": 3 if quick_test else 10,
            "imgsz": 640,  # Image size
            "batch": 2,  # Batch size - small for demo
            "lr0": 0.01,  # Initial learning rate
            "device": 0,  # GPU device
            "workers": 0,  # Number of worker threads
            "project": "./yolo_output",
            "name": "yolo_train",
        },
    }

    try:
        # Initialize lab with default/simple API
        lab.init()
        lab.set_config(training_config)

        # Check if we should resume from a checkpoint
        checkpoint = lab.get_checkpoint_to_resume()
        if checkpoint:
            lab.log(f"📁 Resuming training from checkpoint: {checkpoint}")
            training_config["_config"]["resume"] = checkpoint

        # Log start time
        start_time = datetime.now()
        mode = "Quick test" if quick_test else "Full training"
        lab.log(f"🚀 {mode} started at {start_time}")
        lab.log(f"Using GPU: {os.environ.get('CUDA_VISIBLE_DEVICES', 'All available')}")
        lab.log(f"Model: {training_config['model_name']}")
        lab.log(f"Dataset: {training_config['dataset']}")

        # Create output directory if it doesn't exist
        os.makedirs(training_config["output_dir"], exist_ok=True)
        lab.update_progress(10)

        # Load and prepare YOLO model
        lab.log("Loading YOLO model...")
        try:
            from ultralytics import YOLO

            model_name = training_config["model_name"]
            model = YOLO(model_name)
            lab.log(f"✅ Loaded model: {model_name}")
        except ImportError:
            lab.log("⚠️  Ultralytics not available. Install with: pip install ultralytics")
            lab.finish("Training skipped - ultralytics not available")
            return {"status": "skipped", "reason": "ultralytics not available"}
        except Exception as e:
            lab.log(f"Error loading model: {e}")
            lab.finish("Training failed - model loading error")
            return {"status": "error", "error": str(e)}

        lab.update_progress(20)

        # Set up dataset
        lab.log("Preparing dataset...")
        dataset_name = training_config["dataset"]

        # For coco8 dataset, create the YAML file in current directory
        # Ultralytics will automatically download the dataset when training starts
        if dataset_name == "coco8":
            lab.log("Creating coco8.yaml file...")
            # Create YAML file in current working directory
            dataset_yaml = os.path.join(os.getcwd(), "coco8.yaml")

            # Only create if it doesn't exist
            if not os.path.exists(dataset_yaml):
                yaml_content = """# Ultralytics 🚀 AGPL-3.0 License - https://ultralytics.com/license

# COCO8 dataset (first 8 images from COCO train2017) by Ultralytics
# Documentation: https://docs.ultralytics.com/datasets/detect/coco8/
# Example usage: yolo train data=coco8.yaml
# parent
# ├── ultralytics
# └── datasets
#     └── coco8 ← downloads here (1 MB)

# Train/val/test sets as 1) dir: path/to/imgs, 2) file: path/to/imgs.txt, or 3) list: [path/to/imgs1, path/to/imgs2, ..]
path: coco8 # dataset root dir
train: images/train # train images (relative to 'path') 4 images
val: images/val # val images (relative to 'path') 4 images
test: # test images (optional)

# Classes
names:
  0: person
  1: bicycle
  2: car
  3: motorcycle
  4: airplane
  5: bus
  6: train
  7: truck
  8: boat
  9: traffic light
  10: fire hydrant
  11: stop sign
  12: parking meter
  13: bench
  14: bird
  15: cat
  16: dog
  17: horse
  18: sheep
  19: cow
  20: elephant
  21: bear
  22: zebra
  23: giraffe
  24: backpack
  25: umbrella
  26: handbag
  27: tie
  28: suitcase
  29: frisbee
  30: skis
  31: snowboard
  32: sports ball
  33: kite
  34: baseball bat
  35: baseball glove
  36: skateboard
  37: surfboard
  38: tennis racket
  39: bottle
  40: wine glass
  41: cup
  42: fork
  43: knife
  44: spoon
  45: bowl
  46: banana
  47: apple
  48: sandwich
  49: orange
  50: broccoli
  51: carrot
  52: hot dog
  53: pizza
  54: donut
  55: cake
  56: chair
  57: couch
  58: potted plant
  59: bed
  60: dining table
  61: toilet
  62: tv
  63: laptop
  64: mouse
  65: remote
  66: keyboard
  67: cell phone
  68: microwave
  69: oven
  70: toaster
  71: sink
  72: refrigerator
  73: book
  74: clock
  75: vase
  76: scissors
  77: teddy bear
  78: hair drier
  79: toothbrush

# Download script/URL (optional)
download: https://github.com/ultralytics/assets/releases/download/v0.0.0/coco8.zip
"""
                with open(dataset_yaml, "w") as f:
                    f.write(yaml_content)
                lab.log(f"✅ Created {dataset_yaml}")
            else:
                lab.log(f"✅ Using existing {dataset_yaml}")

            dataset_path = dataset_yaml
            lab.log("Ultralytics will automatically download the coco8 dataset when training starts")
        elif dataset_name.startswith("huggingface:"):
            # Example: "huggingface:keremberke/yolov8m-pothole" or similar
            hf_dataset_name = dataset_name.replace("huggingface:", "")
            lab.log(f"Loading dataset from Hugging Face: {hf_dataset_name}")
            try:
                # Import check for datasets library
                import importlib.util

                if importlib.util.find_spec("datasets") is not None:
                    # Load dataset (this would need conversion to YOLO format in production)
                    lab.log("Note: Hugging Face dataset loading requires YOLO format conversion")
                    lab.log("For demo, falling back to coco8. In production, convert HF dataset to YOLO format.")
                    dataset_path = "coco8"  # Fallback for demo
                else:
                    raise ImportError("datasets library not available")
            except ImportError:
                lab.log("datasets library not available, using coco8")
                dataset_path = "coco8"
        else:
            # Assume it's a path to YOLO format dataset YAML file
            # Make it absolute if it's a relative path
            if os.path.isabs(dataset_name):
                dataset_path = dataset_name
            else:
                dataset_path = os.path.abspath(dataset_name)
            lab.log(f"Using dataset from path: {dataset_path}")

        lab.update_progress(30)

        # Start training
        lab.log("🚀 Starting YOLO training...")
        lab.log(f"Training for {training_config['_config']['epochs']} epochs...")
        try:
            # Prepare training arguments
            train_kwargs = {
                "data": dataset_path,
                "epochs": training_config["_config"]["epochs"],
                "imgsz": training_config["_config"]["imgsz"],
                "batch": training_config["_config"]["batch"],
                "lr0": training_config["_config"]["lr0"],
                "device": training_config["_config"]["device"],
                "workers": training_config["_config"]["workers"],
                "project": training_config["_config"]["project"],
                "name": training_config["_config"]["name"],
                "save": True,  # Save checkpoints
                "save_period": 1 if quick_test else 5,  # Save every N epochs
                "verbose": True,  # Print training progress
            }

            # Add resume if checkpoint exists
            if checkpoint:
                train_kwargs["resume"] = checkpoint

            # Train the model
            # Ultralytics YOLO training will print progress automatically
            results = model.train(**train_kwargs)

            lab.log("✅ Training completed successfully")
            lab.update_progress(90)

            # Log training results - Ultralytics returns a Results object
            if results:
                # Extract metrics from results
                try:
                    # Results object has various attributes
                    if hasattr(results, "results_dict"):
                        metrics = results.results_dict
                        lab.log(f"📈 Final metrics: {json.dumps(metrics, indent=2)}")
                    elif hasattr(results, "results"):
                        metrics = results.results
                        lab.log("📈 Training completed with metrics")
                        lab.log(f"Best fitness (mAP50): {results.fitness if hasattr(results, 'fitness') else 'N/A'}")

                    # Log key metrics if available
                    if hasattr(results, "metrics"):
                        lab.log(f"📊 Metrics: {results.metrics}")
                except Exception as e:
                    lab.log(f"Note: Could not extract detailed metrics: {e}")
                    lab.log("Training completed successfully (check output directory for results)")

        except Exception as e:
            lab.log(f"Error during training: {e}")
            import traceback

            traceback.print_exc()
            lab.finish(f"Training failed: {str(e)}")
            return {"status": "error", "error": str(e)}

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")

        # Save training artifacts
        lab.log("💾 Saving training artifacts...")

        # Find the best model and latest checkpoint
        project_dir = Path(training_config["_config"]["project"])
        run_dir = project_dir / training_config["_config"]["name"]

        best_model_path = None
        latest_checkpoint = None

        if run_dir.exists():
            # Look for best.pt (best model) and last.pt (latest checkpoint)
            best_pt = run_dir / "weights" / "best.pt"
            last_pt = run_dir / "weights" / "last.pt"

            if best_pt.exists():
                best_model_path = str(best_pt.parent)
                lab.log(f"Found best model at: {best_model_path}")

            if last_pt.exists():
                latest_checkpoint = str(last_pt.parent)
                lab.log(f"Found latest checkpoint at: {latest_checkpoint}")

            # Save checkpoints if they exist
            if latest_checkpoint:
                try:
                    saved_checkpoint_path = lab.save_checkpoint(
                        latest_checkpoint, f"yolo_checkpoint_epoch_{training_config['_config']['epochs']}"
                    )
                    lab.log(f"✅ Saved checkpoint: {saved_checkpoint_path}")
                except Exception as e:
                    lab.log(f"⚠️  Could not save checkpoint: {e}")

        # Save training configuration as artifact
        config_file = os.path.join(training_config["output_dir"], "training_config.json")
        with open(config_file, "w") as f:
            json.dump(training_config, f, indent=2)

        config_artifact_path = lab.save_artifact(config_file, "training_config.json")
        lab.log(f"Saved training config: {config_artifact_path}")

        # Save training summary
        summary_file = os.path.join(training_config["output_dir"], "training_summary.txt")
        with open(summary_file, "w") as f:
            f.write("YOLO Training Summary\n")
            f.write("====================\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write(f"Model: {training_config['model_name']}\n")
            f.write(f"Dataset: {training_config['dataset']}\n")
            f.write(f"Epochs: {training_config['_config']['epochs']}\n")
            f.write(f"Image Size: {training_config['_config']['imgsz']}\n")
            f.write(f"Batch Size: {training_config['_config']['batch']}\n")
            f.write(f"Completed at: {end_time}\n")
            if best_model_path:
                f.write(f"Best Model: {best_model_path}\n")
            if latest_checkpoint:
                f.write(f"Latest Checkpoint: {latest_checkpoint}\n")

        summary_artifact_path = lab.save_artifact(summary_file, "training_summary.txt")
        lab.log(f"Saved training summary: {summary_artifact_path}")

        # Save the best model
        if best_model_path:
            try:
                saved_model_path = lab.save_model(
                    best_model_path,
                    name="yolo_trained_model",
                    architecture="yolo",
                    pipeline_tag="object-detection",
                    parent_model=training_config["model_name"],
                )
                lab.log(f"✅ Model saved to Model Zoo: {saved_model_path}")
            except Exception as e:
                lab.log(f"⚠️  Could not save model: {e}")
        else:
            # Fallback: save the model from the run directory
            if run_dir.exists():
                try:
                    saved_model_path = lab.save_model(
                        str(run_dir),
                        name="yolo_trained_model",
                        architecture="yolo",
                        pipeline_tag="object-detection",
                        parent_model=training_config["model_name"],
                    )
                    lab.log(f"✅ Model saved to Model Zoo: {saved_model_path}")
                except Exception as e:
                    lab.log(f"⚠️  Could not save model: {e}")

        lab.update_progress(100)

        # Complete the job
        lab.finish("YOLO training completed successfully")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": training_config["output_dir"],
            "best_model_path": best_model_path,
            "latest_checkpoint": latest_checkpoint,
            "mode": "quick_test" if quick_test else "full_training",
            "gpu_used": os.environ.get("CUDA_VISIBLE_DEVICES", "all"),
        }

    except KeyboardInterrupt:
        lab.error("Training stopped by user")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        print(f"Training failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a YOLO model with lab SDK integration.")
    parser.add_argument("--quick-training", action="store_true", help="Run in quick test mode")

    args = parser.parse_args()

    quick_test = args.quick_training

    if quick_test:
        print("🚀 Running quick test mode...")
    else:
        print("🚀 Running full training mode...")

    result = train_yolo(quick_test=quick_test)
    print("Training result:", result)
