import os
import re
import sys

def pascal_to_snake(name: str) -> str:
    """
    Converts a PascalCase string to snake_case.

    Example: "MyFileName" -> "my_file_name"
    """
    # 1. Insert an underscore before any uppercase letter that is followed by a lowercase letter
    #    (e.g., 'FileN' -> 'File_N')
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name)
    
    # 2. Insert an underscore between consecutive uppercase letters if a lowercase letter follows
    #    (e.g., 'HTTPResponse' -> 'http_response' is preferred over 'h_t_t_p_response')
    #    This is handled well by the first substitution, but a separate pattern may be needed
    #    for complex cases. For simplicity and reliability in common filenames, the first
    #    substitution is usually sufficient.
    
    # 3. Convert the entire string to lowercase.
    return name.lower()

def rename_files_recursive(root_dir: str):
    """
    Recursively walks through a directory, finds all *.py files, and renames them 
    from PascalCase to snake_case.
    """
    print(f"Starting recursive file renaming in: {os.path.abspath(root_dir)}")
    rename_count = 0
    
    # os.walk generates the file names in a directory tree by walking the tree 
    # either top-down or bottom-up.
    for folder_path, _, filenames in os.walk(root_dir):
        for old_name in filenames:
            # Check for the .py extension
            if old_name.endswith('.py'):
                base_name, ext = os.path.splitext(old_name)
                
                # Apply the conversion
                new_base_name = pascal_to_snake(base_name)
                
                new_name = new_base_name + ext
                
                # Check if renaming is actually necessary (e.g., skip if already snake_case)
                if old_name == new_name:
                    continue
                
                old_path = os.path.join(folder_path, old_name)
                new_path = os.path.join(folder_path, new_name)
                
                # Safety check: ensure the target file does not already exist
                if os.path.exists(new_path):
                    print(f"Skipped: Target file already exists: {new_path}")
                    continue
                
                try:
                    # Perform the rename operation
                    os.rename(old_path, new_path)
                    print(f"Renamed: '{old_path}' -> '{new_name}'")
                    rename_count += 1
                except OSError as e:
                    print(f"Error renaming {old_path}: {e}")

    print("-" * 30)
    print(f"Renaming complete. Total files renamed: {rename_count}")

if __name__ == "__main__":
    # Get the directory path from command line arguments, or use the current directory ('.')
    if len(sys.argv) > 1:
        start_directory = sys.argv[1]
    else:
        start_directory = '.'
        
    # Check if the path is valid before proceeding
    if not os.path.isdir(start_directory):
        print(f"Error: Directory not found at path: {start_directory}")
        sys.exit(1)

    # Note: Using absolute paths is safer for recursive operations
    start_directory = os.path.abspath(start_directory)
    
    print("WARNING: This script will rename files on your filesystem.")
    print(f"It will operate on files in: {start_directory} and all subdirectories.")
    
    confirmation = input("Type 'YES' to proceed with file renaming: ")
    
    if confirmation.strip().upper() == 'YES':
        rename_files_recursive(start_directory)
    else:
        print("Operation cancelled by user.")
        sys.exit(0)
