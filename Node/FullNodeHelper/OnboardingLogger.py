import datetime

def OnboardingLogger(log):
    now = datetime.datetime.now()
    print(str(now) + ' ' + str(log))