from config_models import Layer2LedgerCommonSettings
from config_loader import get_project_root

def main():
    project_root = get_project_root()
    print(f"Project root is at: {project_root}")

if __name__ == "__main__":
    main()
