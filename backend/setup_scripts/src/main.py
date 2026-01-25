from config_models import Layer2LedgerCommonSettings
from config_loader import get_project_root, get_config_file

def main():
    project_root = get_project_root()
    print(f"Project root is at: {project_root}")

    env = 'dev'
    service = 'layer2ledgerapihandler'
    print(f"Environment: {env}, Service: {service} configuration file path: {get_config_file(service, env)}")

if __name__ == "__main__":
    main()
