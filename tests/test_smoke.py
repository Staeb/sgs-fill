import pytest

from tests.chrome import run_js
from tests.conftest import needs_chrome


@needs_chrome
def test_run_js_returns_json_values():
    assert run_js("return 1 + 1;", modules=()) == 2


@needs_chrome
def test_run_js_reports_thrown_errors():
    with pytest.raises(RuntimeError, match="boom"):
        run_js("throw new Error('boom');", modules=())


@needs_chrome
def test_the_sf_namespace_exists_after_loading_text():
    assert run_js("return typeof SF;", modules=("text",)) == "object"
