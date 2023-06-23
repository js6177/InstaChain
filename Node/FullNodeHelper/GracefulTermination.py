import time
import os
import filelock
from OnboardingLogger import OnboardingLogger


LOCKFILE_PATH = 'onboardinghelper.lock'
lock = filelock.FileLock(LOCKFILE_PATH)
with lock.acquire(timeout=1):
    time.sleep(1)
    lock.release()
    OnboardingLogger("Terminating onboardinghelper. Allow 60 seconds for termination, check onboardinghelper.log for confimation")
    
quit()