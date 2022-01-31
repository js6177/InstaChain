import redis
import os

redis_host = os.environ.get('REDISHOST', 'localhost')
redis_port = int(os.environ.get('REDISPORT', 6379))
redis_auth = os.environ.get('REDISAUTH', '')
redis_client = redis.Redis(host=redis_host, port=redis_port, password=redis_auth, decode_responses=True, health_check_interval=30)

def set(key, val):
	return redis_client.set(key, int(val))

def get(key, defaultValue=None):
	return redis_client.get(key) or defaultValue

def clearDatabase():
	return redis_client.flushdb("SYNC")
