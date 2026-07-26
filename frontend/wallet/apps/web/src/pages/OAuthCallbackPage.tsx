import { type React, useEffect } from "react";

export function OAuthCallbackPage(): React.JSX.Element {
	useEffect(() => {
		// If we ever switch to isCrossOrigin={true}, we would need to post the message to the opener.
		// For isCrossOrigin={false}, react-simple-oauth2-login polls this window's location automatically.
	}, []);

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
			<h1 className="text-2xl font-bold tracking-tight">Authenticating...</h1>
			<p className="text-muted-foreground">
				Please wait while we complete the login process. This window should
				close automatically.
			</p>
		</div>
	);
}
