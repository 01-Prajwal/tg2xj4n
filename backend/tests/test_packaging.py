"""Guard against the deploy requirements drifting from the project's dependencies."""

import tomllib

from app.config import BACKEND_DIR


def test_requirements_txt_matches_pyproject() -> None:
    pyproject = tomllib.loads((BACKEND_DIR / "pyproject.toml").read_text())
    declared = set(pyproject["project"]["dependencies"])
    lines = (BACKEND_DIR.parent / "requirements.txt").read_text().splitlines()
    required = {ln.strip() for ln in lines if ln.strip() and not ln.startswith("#")}
    assert required == declared
