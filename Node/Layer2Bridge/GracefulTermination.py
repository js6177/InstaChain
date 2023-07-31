import time
import os
import filelock
from OnboardingLogger import OnboardingLogger
from Layer2Bridge import LOCKFILE_PATH

lock = filelock.FileLock(LOCKFILE_PATH)
with lock.acquire(timeout=1):
    time.sleep(1)
    lock.release()
    OnboardingLogger("Terminating Layer2Bridge. Allow 60 seconds for termination, check Layer2Bridge.log for confimation")
    
quit()