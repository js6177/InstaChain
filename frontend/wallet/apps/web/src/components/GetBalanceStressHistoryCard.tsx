import { LABELS, ROUTES } from "@openl2/wallet-shared";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useGetBalanceStressHistory } from "../hooks/useLayer2Queries";

/**
 * Recent getBalance stress batches from Redis, shown under Profiler Stats.
 */
export function GetBalanceStressHistoryCard(): JSX.Element {
	const { data, isLoading, isError } = useGetBalanceStressHistory();
	const entries = data?.entries ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">
					{LABELS.HEADING_GET_BALANCE_STRESS_HISTORY}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading && (
					<p className="text-sm text-muted-foreground animate-pulse">
						{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_LOADING}
					</p>
				)}
				{(isError || (!isLoading && entries.length === 0)) && (
					<p className="text-sm text-muted-foreground">
						{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_EMPTY}
					</p>
				)}
				{!isLoading && entries.length > 0 && (
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-left">
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_COMPLETED}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_CELLS}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_CONCURRENCY}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_MIN_SUCCESS}
									</th>
									<th className="px-3 py-2 font-medium">
										{LABELS.TEXT_GET_BALANCE_STRESS_HISTORY_AVG_RPS}
									</th>
									<th className="px-3 py-2 font-medium" />
								</tr>
							</thead>
							<tbody>
								{entries.map((entry) => (
									<tr key={entry.batch_id} className="border-b">
										<td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
											{new Date(entry.completed_at_unix_ms).toISOString()}
										</td>
										<td className="px-3 py-2 font-mono">{entry.run_count}</td>
										<td className="px-3 py-2 font-mono">
											{entry.concurrency}
										</td>
										<td className="px-3 py-2 font-mono">
											{entry.min_success_rate_pct}
										</td>
										<td className="px-3 py-2 font-mono">
											{entry.avg_requests_per_second}
										</td>
										<td className="px-3 py-2">
											<Button asChild variant="outline" size="sm">
												<Link
													to={ROUTES.buildExplorerStats(
														entry.profiler_session_id,
													)}
												>
													{LABELS.BUTTON_GET_BALANCE_STRESS_HISTORY_OPEN}
												</Link>
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
