import os
import sys

os.environ["SPHINX_BUILD"] = "1"
# Path to your module (from the run script)
TLAB_DIR = os.path.expanduser("~/.transformerlab/src")
sys.path.insert(0, TLAB_DIR)

# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = "transformerlab"
copyright = "2025, transformerlab"
author = "transformerlab"
release = "0.1"

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.autosummary",
    "sphinx.ext.napoleon",  # for Google/NumPy docstrings
    "sphinx.ext.viewcode",
    "sphinx_autodoc_typehints",
]
autodoc_mock_imports = [
    "transformerlab.shared.download_huggingface_model",
    "transformerlab.plugin_sdk",
    "transformerlab.routers.tools",
    "plugin_harness",
    "torch",
    "workos",
    "plugin_sdk",
    "transformerlab.plugin_sdk",
    "transformerlab.fastchat_openai_api",
    "torch",
    "transformers",
    "safetensors",
    "fastchat",
    "pydantic_settings",
    "sqlalchemy",
]
autodoc_default_options = {
    "members": True,
    "undoc-members": True,
    "show-inheritance": True,
    "exclude-members": "__weakref__",
}
autosummary_generate = True
autodoc_typehints = "description"
autodoc_skip_member = lambda app, what, name, obj, skip, options: True if repr(obj).startswith("<Mock") else None
autodoc_preserve_defaults = True
autosummary_ignore_module_all = False
suppress_warnings = ["autodoc.mocked_object"]
autodoc_inherit_docstrings = True
autodoc_mock_imports = autodoc_mock_imports
napoleon_google_docstring = True
napoleon_numpy_docstring = True
html_theme = "sphinx_rtd_theme"
typehints_fully_qualified = False
typehints_use_signature = False
templates_path = ["_templates"]
exclude_patterns = []


# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = "alabaster"
html_static_path = ["_static"]
