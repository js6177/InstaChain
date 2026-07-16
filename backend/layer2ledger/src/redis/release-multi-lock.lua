local keys_to_delete = {}
for i, key in ipairs(KEYS) do
  if redis.call('GET', key) == ARGV[1] then
    table.insert(keys_to_delete, key)
  end
end
if #keys_to_delete ~= #KEYS then
  return 0
end
return redis.call('DEL', unpack(keys_to_delete))
