import os
import subprocess


def run_command(command: str) -> str:
    print(os.environ)
    result = subprocess.run(command, shell=True, text=True, capture_output=True)
    return result.stdout
