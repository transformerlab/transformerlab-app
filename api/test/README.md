## Testing

So far we have the following PyTests:

* `db/*` These are tests for the database layer
* `plugins/*` In here is a test to ensure all plugin `index.json` follow the correct plugin schema
* `api/*` here are all the tests for the API. Make sure you activate the conda environment before running these tests.

### Running the Tests

Run these from the root of the project.

To run the faster non-API tests:
```
uv pip install --system pytest pytest-asyncio jsonschema shellcheck-py
pytest test/db/ test/plugins/
```

To run the slower API tests:
```
uv pip install --system pytest pytest-asyncio jsonschema requests shellcheck-py
pytest test/api/
```