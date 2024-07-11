export function TransactionTimestampToDate(timeStamp: number): string {
  const date = new Date(timeStamp * 1000);
  return date.toLocaleString();
}