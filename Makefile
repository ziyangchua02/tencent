PY := .venv/bin/python

.PHONY: setup data api ui test eval reset

setup:            ## create the virtualenv and install dependencies
	python3 -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt

data:             ## regenerate the synthetic PDF corpus + manifest
	$(PY) -m scripts.generate_dataset

api:              ## run the FastAPI backend on :8000 (seeds the knowledge base on first start)
	$(PY) -m uvicorn backend.main:app --port 8000

ui:               ## run the Streamlit UI on :8501 (needs the API running)
	$(PY) -m streamlit run frontend/app.py --server.port 8501

test:             ## run the test suite (offline, ~2 s)
	$(PY) -m pytest -q

eval:             ## run the golden-set evaluation from the command line
	$(PY) -m scripts.run_eval

reset:            ## wipe runtime state (database, index, audit log) but keep the downloaded model
	find data/store -mindepth 1 -maxdepth 1 ! -name models -exec rm -rf {} +
