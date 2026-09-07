import os
import tempfile
from pathlib import Path

# Point the app at a throwaway DB before app.config is imported.
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="my-radio-test-")) / "test.db")
