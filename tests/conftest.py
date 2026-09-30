import pytest

from tests.chrome import find_chrome

try:
    find_chrome()
    HAVE_CHROME = True
except FileNotFoundError:
    HAVE_CHROME = False

needs_chrome = pytest.mark.skipif(not HAVE_CHROME, reason="ไม่มี Chrome ในเครื่องนี้")
