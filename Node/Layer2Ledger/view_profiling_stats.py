import pstats
from pstats import SortKey

try:
    p = pstats.Stats('prof/combined.prof')
    p.strip_dirs().sort_stats(SortKey.CUMULATIVE).print_stats(50)
except FileNotFoundError:
    print("Error: The 'prof/combined.prof' file was not found.")
    print("Please make sure you have run the profiler first using 'pytest --profile'.")
except Exception as e:
    print(f"An error occurred: {e}")
