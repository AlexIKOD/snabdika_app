"""Bundle a self-contained Windows sidecar; run from app/."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onedir',
                '--name', 'snabdika-backend', '--paths', str(root),
                '--collect-all', 'keyring', '--hidden-import', 'win32ctypes.pywin32.win32cred',
                '--distpath', str(root / 'backend/dist'), '--workpath', str(root / 'backend/build'),
                '--specpath', str(root / 'backend/build'), str(root / 'backend/entrypoint.py')],
               cwd=root, check=True)
