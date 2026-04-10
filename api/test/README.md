# Testing

So far we have the following PyTests:

* `db/*` These are tests for the database layer
* `api/*` here are all the tests for the API. Make sure you activate the conda environment before running these tests.

## Running the Tests

Run these from the root of the project.

To run the faster non-API tests:

```bash
uv pip install --system pytest pytest-asyncio jsonschema shellcheck-py
pytest test/db/
```

To run the slower API tests:

```bash
uv pip install --system pytest pytest-asyncio jsonschema requests shellcheck-py
pytest test/api/
```
