import type {
	FindOauth2UserByIdRequest,
	OAuthService,
} from "@openl2/api-layer2oauthmanager";
import {
	formatAmount,
	LABELS,
	ROUTES,
	TEST_IDS,
	useDenominationStore,
	useWalletStore,
} from "@openl2/wallet-shared";
import { Search } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Link,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OAuthUserCard } from "../components/OAuthUserCard";
import { GetBalanceStressHistoryCard } from "../components/GetBalanceStressHistoryCard";
import {
	GetBalanceProfilerChart,
	type GetBalanceProfilerTableRow,
} from "../components/GetBalanceProfilerChart";
import { RedisStressDiagnosticsPanel } from "../components/RedisStressDiagnosticsPanel";
import { ProfilerSessionChart } from "../components/ProfilerSessionChart";
import {
	collectProfilerXValues,
	parseGetBalanceStressVariables,
	recalculateTotalTxsPerSec,
} from "../components/profiler-session-chart-utils";
import { TransactionItem } from "../components/TransactionItem";
import { useFindOAuthUserById } from "../hooks/useLayer2LedgerOauthManagerQueries";
import {
	useAddressBalance,
	useProfilerSession,
	useProfilerSessions,
	useTransaction,
	useTransactions,
} from "../hooks/useLayer2Queries";

function SearchBar(): React.JSX.Element {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const [query, setQuery] = useState(searchParams.get("q") || "");

	const handleSearch = (e: React.FormEvent): void => {
		e.preventDefault();
		if (!query.trim()) return;
		navigate(ROUTES.buildExplorerSearch(query.trim()));
	};

	return (
		<form
			onSubmit={handleSearch}
			className="flex gap-2 w-full max-w-2xl mx-auto mb-8"
		>
			<Input
				placeholder="Search by Address Pubkey or Transaction ID..."
				value={query}
				onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
					setQuery(e.target.value)
				}
				className="flex-1"
			/>
			<Button type="submit">
				<Search className="w-4 h-4 mr-2" />
				{LABELS.BUTTON_SEARCH}
			</Button>
		</form>
	);
}

function AddressView(): React.JSX.Element | null {
	const { denomination } = useDenominationStore();
	const { addressId } = useParams();
	const { data: balance, isLoading: isBalanceLoading } = useAddressBalance(
		addressId || "",
	);
	const { data: txData, isLoading: isTxLoading } = useTransactions(
		addressId || "",
	);

	if (!addressId) return null;

	const isLoading = isBalanceLoading || isTxLoading;
	const transactionsList =
		txData?.transaction_groups?.flatMap((group) => group.transactions) || [];
	const sortedTransactions = transactionsList.sort(
		(a, b) =>
			new Date(b.timestamp ?? 0).getTime() -
			new Date(a.timestamp ?? 0).getTime(),
	);

	return (
		<div className="space-y-6 animate-in fade-in">
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">Address Overview</CardTitle>
					<CardDescription className="font-mono break-all text-foreground mt-2">
						{addressId}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm text-muted-foreground">Balance</p>
							<p
								className="text-2xl font-bold"
								data-testid={TEST_IDS.BALANCE_DISPLAY}
							>
								{isBalanceLoading
									? "..."
									: formatAmount(balance?.balance ?? null, denomination)}{" "}
								{denomination}
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Transactions</p>
							<p className="text-2xl font-bold">
								{isTxLoading ? "..." : transactionsList.length}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<div>
				<h3 className="text-lg font-bold mb-4">Transactions</h3>
				{isLoading && (
					<p className="text-muted-foreground animate-pulse">
						{LABELS.TEXT_LOADING_TRANSACTIONS}
					</p>
				)}
				{!isLoading && sortedTransactions.length === 0 && (
					<p className="text-muted-foreground">{LABELS.TEXT_NO_TRANSACTIONS}</p>
				)}
				{!isLoading && sortedTransactions.length > 0 && (
					<Accordion type="single" collapsible className="w-full">
						{sortedTransactions.map((tx) => (
							<TransactionItem
								key={tx.layer2_transaction_id}
								transaction={tx}
								currentAddress={addressId}
							/>
						))}
					</Accordion>
				)}
			</div>
		</div>
	);
}

function TransactionViewWrapper(): React.JSX.Element | null {
	const { txId } = useParams();
	const { data: txResponse, isLoading } = useTransaction(txId || "");
	const { mainAddress } = useWalletStore();

	if (!txId) return null;

	return (
		<div className="space-y-6 animate-in fade-in">
			<h2 className="text-xl font-bold mb-4">
				{LABELS.HEADING_TRANSACTION_DETAILS}
			</h2>
			{isLoading && (
				<p className="text-muted-foreground animate-pulse">
					{LABELS.TEXT_LOADING_TRANSACTIONS}
				</p>
			)}
			{!isLoading && !txResponse?.transaction && (
				<p className="text-red-500">{LABELS.TEXT_TRANSACTION_NOT_FOUND}</p>
			)}
			{!isLoading && txResponse?.transaction && (
				<Accordion
					type="single"
					collapsible
					defaultValue={txResponse.transaction.layer2_transaction_id}
					className="w-full"
				>
					<TransactionItem
						transaction={txResponse.transaction}
						currentAddress={mainAddress?.public_key_str_base58}
					/>
				</Accordion>
			)}
		</div>
	);
}

function SearchRouter(): React.JSX.Element {
	const [searchParams] = useSearchParams();
	const query = searchParams.get("q");
	const navigate = useNavigate();

	useEffect(() => {
		if (query) {
			// Todo: force transactions to be a specific length in the backend, in order to make searching/finding easier.
			if (query.length === 64 && /^[0-9a-fA-F]+$/.test(query)) {
				navigate(ROUTES.buildExplorerTransaction(query), { replace: true });
			} else {
				navigate(ROUTES.buildExplorerAddress(query), { replace: true });
			}
		}
	}, [query, navigate]);

	return (
		<div className="text-center text-muted-foreground">
			{LABELS.TEXT_SEARCHING}
		</div>
	);
}

function OAuthUserExplorerView(): React.JSX.Element {
	const { service_name, service_specific_id } = useParams();
	const { denomination } = useDenominationStore();
	const findUserByIdRequest: FindOauth2UserByIdRequest | undefined =
		service_name && service_specific_id
			? {
					service_name: service_name as unknown as OAuthService,
					service_specific_id,
				}
			: undefined;
	const {
		data,
		isLoading: isLoadingUser,
		error,
	} = useFindOAuthUserById(findUserByIdRequest);

	const userData = data?.user;
	const pubkey = data?.layer2_address_pubkey ?? "";

	const { data: balance, isLoading: isBalanceLoading } =
		useAddressBalance(pubkey);
	const { data: txData, isLoading: isTxLoading } = useTransactions(pubkey);

	if (isLoadingUser)
		return (
			<p className="text-muted-foreground animate-pulse text-center mt-10">
				{LABELS.TEXT_SEARCHING}
			</p>
		);
	if (error)
		return (
			<p className="text-red-500 text-center mt-10">Error: {error.message}</p>
		);
	if (!userData)
		return (
			<p className="text-muted-foreground text-center mt-10">User not found</p>
		);

	const isLoading = isBalanceLoading || isTxLoading;
	const transactionsList =
		txData?.transaction_groups?.flatMap((group) => group.transactions) || [];
	const sortedTransactions = transactionsList.sort(
		(a, b) =>
			new Date(b.timestamp ?? 0).getTime() -
			new Date(a.timestamp ?? 0).getTime(),
	);

	return (
		<div className="space-y-6 animate-in fade-in">
			<OAuthUserCard user={userData} />
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">Address Overview</CardTitle>
					<CardDescription className="font-mono break-all text-foreground mt-2">
						{pubkey || "No Layer2 Address found"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="text-sm text-muted-foreground">Balance</p>
							<p
								className="text-2xl font-bold"
								data-testid={TEST_IDS.BALANCE_DISPLAY}
							>
								{isBalanceLoading && pubkey
									? "..."
									: formatAmount(balance?.balance ?? null, denomination)}{" "}
								{denomination}
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Transactions</p>
							<p className="text-2xl font-bold">
								{isTxLoading && pubkey ? "..." : transactionsList.length}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<div>
				<h3 className="text-lg font-bold mb-4">Transactions</h3>
				{isLoading && pubkey && (
					<p className="text-muted-foreground animate-pulse">
						{LABELS.TEXT_LOADING_TRANSACTIONS}
					</p>
				)}
				{!isLoading && pubkey && sortedTransactions.length === 0 && (
					<p className="text-muted-foreground">{LABELS.TEXT_NO_TRANSACTIONS}</p>
				)}
				{!isLoading && pubkey && sortedTransactions.length > 0 && (
					<Accordion type="single" collapsible className="w-full">
						{sortedTransactions.map((tx) => (
							<TransactionItem
								key={tx.layer2_transaction_id}
								transaction={tx}
								currentAddress={pubkey}
							/>
						))}
					</Accordion>
				)}
			</div>
		</div>
	);
}

function StatsFormView(): React.JSX.Element {
	const navigate = useNavigate();
	const [sessionId, setSessionId] = useState("");

	const handleSubmit = (e: React.FormEvent): void => {
		e.preventDefault();
		const trimmed = sessionId.trim();
		if (!trimmed) return;
		navigate(ROUTES.buildExplorerStats(trimmed));
	};

	return (
		<div className="space-y-6 animate-in fade-in">
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">
						{LABELS.HEADING_PROFILER_STATS}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="flex gap-2">
						<Input
							placeholder={LABELS.PLACEHOLDER_PROFILER_SESSION_ID}
							value={sessionId}
							onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
								setSessionId(e.target.value)
							}
							className="flex-1 font-mono"
						/>
						<Button type="submit">{LABELS.BUTTON_LOAD_STATS}</Button>
					</form>
				</CardContent>
			</Card>
			<GetBalanceStressHistoryCard />
		</div>
	);
}

function StatsSessionView(): React.JSX.Element | null {
	const { sessionId } = useParams();
	const navigate = useNavigate();
	const { data, isLoading, isError } = useProfilerSession(sessionId || "");
	const [showStartMarker, setShowStartMarker] = useState(true);
	const [showEndMarker, setShowEndMarker] = useState(true);
	const [throughputStartMs, setThroughputStartMs] = useState<number | null>(
		null,
	);
	const [throughputEndMs, setThroughputEndMs] = useState<number | null>(null);
	const [committedTxsPerSec, setCommittedTxsPerSec] = useState<number | null>(
		null,
	);
	const [viewStartMs, setViewStartMs] = useState(0);
	const [viewEndMs, setViewEndMs] = useState(1);
	const initializedSessionIdRef = useRef<string | null>(null);

	const session = data?.session;
	const isGetBalanceSession = Boolean(
		session?.apis.includes("getBalance") &&
			!session.apis.includes("pushTransaction"),
	);
	const getBalanceVariables = useMemo(() => {
		if (!session?.description || !isGetBalanceSession) {
			return null;
		}
		return parseGetBalanceStressVariables(session.description);
	}, [session, isGetBalanceSession]);
	const batchSessionIds = useMemo(() => {
		const fromDescription = getBalanceVariables?.batchSessionIds ?? [];
		if (fromDescription.length > 0) {
			return fromDescription;
		}
		return sessionId ? [sessionId] : [];
	}, [getBalanceVariables, sessionId]);
	const batchQueries = useProfilerSessions(
		isGetBalanceSession ? batchSessionIds : [],
	);
	const getBalanceTableRows = useMemo((): GetBalanceProfilerTableRow[] => {
		if (!isGetBalanceSession) {
			return [];
		}
		const rows: GetBalanceProfilerTableRow[] = [];
		for (const [index, id] of batchSessionIds.entries()) {
			if (!id) {
				continue;
			}
			const batchSession = batchQueries[index]?.data?.session;
			const vars = batchSession?.description
				? parseGetBalanceStressVariables(batchSession.description)
				: id === sessionId
					? getBalanceVariables
					: null;
			const stats = batchSession?.api_stats.find(
				(entry) => entry.api === "getBalance",
			);
			rows.push({
				sessionId: id,
				callCount: vars?.callCount ?? "—",
				addressCount: vars?.addressCount ?? "—",
				cachePct: vars?.cachePct ?? "—",
				nonzeroPct: vars?.nonzeroPct ?? "—",
				successRatePct: vars?.successRatePct ?? null,
				timeseries: batchSession?.timeseries.get_balance ?? null,
				throughputPerSec: stats?.throughput_per_sec ?? null,
				avgLatencyMs: stats?.avg_latency_ms ?? null,
				peakConcurrent: stats?.peak_concurrent ?? null,
			});
		}
		return rows;
	}, [
		isGetBalanceSession,
		batchSessionIds,
		batchQueries,
		sessionId,
		getBalanceVariables,
	]);

	const dataMaxMs = useMemo(() => {
		if (!session) {
			return 1;
		}
		const xs = collectProfilerXValues(
			session.timeseries,
			throughputStartMs,
			throughputEndMs,
		);
		return Math.max(xs[xs.length - 1] ?? 1, 1);
	}, [session, throughputStartMs, throughputEndMs]);

	useEffect(() => {
		if (!session) {
			return;
		}
		if (initializedSessionIdRef.current === session.session_id) {
			return;
		}
		initializedSessionIdRef.current = session.session_id;
		const start = session.dbwriter?.throughput_start_ms ?? null;
		const end = session.dbwriter?.throughput_end_ms ?? null;
		setThroughputStartMs(start);
		setThroughputEndMs(end);
		setShowStartMarker(true);
		setShowEndMarker(true);
		setCommittedTxsPerSec(
			recalculateTotalTxsPerSec(
				session.dbwriter?.writes_total ?? 0,
				start,
				end,
			),
		);
		const xs = collectProfilerXValues(session.timeseries, start, end);
		const max = Math.max(xs[xs.length - 1] ?? 1, 1);
		setViewStartMs(0);
		setViewEndMs(max);
	}, [session]);

	if (!sessionId) return null;

	return (
		<div className="space-y-6 animate-in fade-in">
			<Card>
				<CardHeader>
					<CardTitle className="text-xl">
						{session?.title ?? LABELS.HEADING_PROFILER_STATS}
					</CardTitle>
					<CardDescription className="font-mono break-all text-foreground mt-2">
						<span className="block text-xs text-muted-foreground mb-1">
							{LABELS.TEXT_PROFILER_SESSION_ID}
						</span>
						{sessionId}
					</CardDescription>
					{session?.description ? (
						<CardDescription className="mt-3">
							<span className="block text-xs text-muted-foreground mb-1">
								{LABELS.TEXT_PROFILER_SESSION_DESCRIPTION}
							</span>
							<pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
								{session.description}
							</pre>
						</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-4">
					<form
						onSubmit={(e: React.FormEvent): void => {
							e.preventDefault();
							const form = e.target as HTMLFormElement;
							const input = form.elements.namedItem(
								"sessionId",
							) as HTMLInputElement | null;
							const next = input?.value.trim();
							if (next) {
								navigate(ROUTES.buildExplorerStats(next));
							}
						}}
						className="flex gap-2"
					>
						<Input
							name="sessionId"
							defaultValue={sessionId}
							placeholder={LABELS.PLACEHOLDER_PROFILER_SESSION_ID}
							className="flex-1 font-mono"
						/>
						<Button type="submit">{LABELS.BUTTON_LOAD_STATS}</Button>
					</form>

					{isLoading && (
						<p className="text-muted-foreground animate-pulse">
							{LABELS.TEXT_LOADING_PROFILER_SESSION}
						</p>
					)}
					{(isError || (!isLoading && !session)) && (
						<p className="text-red-500">
							{LABELS.TEXT_PROFILER_SESSION_NOT_FOUND}
						</p>
					)}
					{session && isGetBalanceSession && (
						<GetBalanceProfilerChart
							rows={getBalanceTableRows}
							activeSessionId={sessionId}
						/>
					)}
					{session && !isGetBalanceSession && (
						<>
							<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_TOTAL_TXS_PER_SEC}
									</div>
									<div className="font-semibold">
										{committedTxsPerSec ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_THROUGHPUT_START_MS}
									</div>
									<button
										type="button"
										title={LABELS.TEXT_PROFILER_STAT_THROUGHPUT_MARKER_HINT}
										onClick={(): void =>
											setShowStartMarker((value) => !value)
										}
										className={`font-semibold font-mono text-xs sm:text-sm rounded px-1.5 py-0.5 transition-colors ${
											showStartMarker
												? "bg-green-600/15 text-green-700 ring-1 ring-green-600 dark:text-green-400"
												: "hover:bg-muted"
										}`}
									>
										{throughputStartMs ?? "—"}
									</button>
								</div>
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_THROUGHPUT_END_MS}
									</div>
									<button
										type="button"
										title={LABELS.TEXT_PROFILER_STAT_THROUGHPUT_MARKER_HINT}
										onClick={(): void => setShowEndMarker((value) => !value)}
										className={`font-semibold font-mono text-xs sm:text-sm rounded px-1.5 py-0.5 transition-colors ${
											showEndMarker
												? "bg-red-600/15 text-red-700 ring-1 ring-red-600 dark:text-red-400"
												: "hover:bg-muted"
										}`}
									>
										{throughputEndMs ?? "—"}
									</button>
								</div>
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_PUSH_TXS_PER_SEC}
									</div>
									<div className="font-semibold">
										{session.api_stats.find(
											(stats) => stats.api === "pushTransaction",
										)?.throughput_per_sec ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_PEAK_CONCURRENT}
									</div>
									<div className="font-semibold">
										{session.api_stats.find(
											(stats) => stats.api === "pushTransaction",
										)?.peak_concurrent ?? "—"}
									</div>
								</div>
								<div>
									<div className="text-muted-foreground">
										{LABELS.TEXT_PROFILER_STAT_DBWRITER_WRITES}
									</div>
									<div className="font-semibold">
										{session.dbwriter?.writes_total ?? "—"}
									</div>
								</div>
							</div>
							<ProfilerSessionChart
								session={session}
								throughputStartMs={throughputStartMs}
								throughputEndMs={throughputEndMs}
								showStartMarker={showStartMarker}
								showEndMarker={showEndMarker}
								viewStartMs={viewStartMs}
								viewEndMs={viewEndMs}
								dataMaxMs={dataMaxMs}
								onViewRangeChange={(startMs, endMs): void => {
									setViewStartMs(startMs);
									setViewEndMs(endMs);
								}}
								onBoundsDraft={(startMs, endMs): void => {
									setThroughputStartMs(startMs);
									setThroughputEndMs(endMs);
								}}
								onBoundsCommit={(startMs, endMs): void => {
									setThroughputStartMs(startMs);
									setThroughputEndMs(endMs);
									setCommittedTxsPerSec(
										recalculateTotalTxsPerSec(
											session.dbwriter?.writes_total ?? 0,
											startMs,
											endMs,
										),
									);
								}}
							/>
							{session.redis != null ? (
								<RedisStressDiagnosticsPanel
									redis={session.redis}
									sessionStartedAtUnixMs={session.started_at_unix_ms}
								/>
							) : null}
						</>
					)}
				</CardContent>
			</Card>
			<GetBalanceStressHistoryCard />
		</div>
	);
}

export function ExplorerPage(): React.JSX.Element {
	const location = useLocation();
	const isStatsRoute = location.pathname.includes("/stats");
	const showSearchBar = !isStatsRoute;

	return (
		<div className="mx-auto w-full max-w-full min-[640px]:w-[75vw] pt-4 pb-12 px-4">
			{!isStatsRoute ? (
				<div className="mb-8 text-center">
					<h1 className="text-4xl font-extrabold tracking-tight mb-2">
						Block Explorer
					</h1>
					<p className="text-muted-foreground">
						Search and view a Layer2 address or transaction
					</p>
					<p className="mt-3 text-sm">
						<Link
							to={ROUTES.buildExplorerStats()}
							className="text-primary underline-offset-4 hover:underline"
						>
							{LABELS.HEADING_PROFILER_STATS}
						</Link>
					</p>
				</div>
			) : (
				<div className="mb-4 text-sm">
					<Link
						to={ROUTES.buildExplorerStats()}
						className="text-primary underline-offset-4 hover:underline"
					>
						{LABELS.HEADING_PROFILER_STATS}
					</Link>
				</div>
			)}

			{showSearchBar ? <SearchBar /> : null}

			<Routes>
				<Route
					path="/"
					element={
						<div className="text-center text-sm text-muted-foreground mt-10">
							Enter a query above to begin.
						</div>
					}
				/>
				<Route path={ROUTES.EXPLORER_SEARCH} element={<SearchRouter />} />
				<Route path={ROUTES.EXPLORER_ADDRESS} element={<AddressView />} />
				<Route
					path={ROUTES.EXPLORER_TRANSACTION}
					element={<TransactionViewWrapper />}
				/>
				<Route path={ROUTES.EXPLORER_STATS} element={<StatsFormView />} />
				<Route
					path={ROUTES.EXPLORER_STATS_SESSION}
					element={<StatsSessionView />}
				/>
				<Route
					path={ROUTES.EXPLORER_OAUTH_USER}
					element={<OAuthUserExplorerView />}
				/>
			</Routes>
		</div>
	);
}
