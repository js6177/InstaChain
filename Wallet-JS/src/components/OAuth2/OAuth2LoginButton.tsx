import { random, set } from "lodash";
import React, { useEffect, useState } from "react";
import OAuth2Login  from 'react-simple-oauth2-login';
import { SHA256 } from "../../utils/wallet";
import { WorkspaceContext } from "../../context/WorkspaceContext";
import { OAuthResponse } from "../../services/messages/Layer2OAuthManager/Response/OAuthResponse";

const GOOGLE_OAuth2_CLIENT_ID: string = "639252016244-74f6is7u2ultdb4g1cn248pn1090k19t.apps.googleusercontent.com";
const GITHUB_OAuth2_CLIENT_ID: string = "Ov23likC7DPlra38cJvQ";
const TWITTER_OAuth2_CLIENT_ID: string = "MlZNU3FNYWVta2hBN2xYSG9XR2w6MTpjaQ";


export function TwitterLoginWithOAuth2Login(){
  const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);
  const [userData, setUserData] = useState<OAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [PKCE_code, setPKCE_code] = useState<string>(""); //verifier code
  const [PKCE_code_sha256, setPKCE_code_sha256] = useState<string>(""); //sha256 hash of PKCE_code, aka challenge code


  useEffect(() => {
    setPKCE_code(random(1000, 9999).toString());
    const hashedPKCE_code = SHA256(PKCE_code);
    setPKCE_code_sha256(hashedPKCE_code);

    setPKCE_code("J2jQSYS23Dfa2lpPtpiK3qRL8yWaSiqVBwPkf35ZOBY");
    setPKCE_code_sha256("nCwAc2ACqtZeMViumnAgWsYL4wFmyRlGiF2QaL9XK50");
  }, []);

  const handleOAuthExchange = async (code: string, service: string) => {
    try {
      console.log("handleOAuthExchange code: " + code);
      const response = await fetch('http://127.0.0.1:4000/oauth/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, service, code_verifier: PKCE_code }),
      });

      if (!response.ok) {
        throw new Error('OAuth exchange failed');
      }

      const data: OAuthResponse = await response.json();
      console.log("handleOAuthExchange data: " + JSON.stringify(data));
      setUserData(data);
      setError(null);
      workspaceStateManager?.addOAuthUser(data.user, data.user_keys);
    } catch (err) {
      console.log("handleOAuthExchange error: " + (err as Error).message);
      setError((err as Error).message);
      setUserData(null);
    }
  };

return (
  <OAuth2Login
    authorizationUrl="https://twitter.com/i/oauth2/authorize"
    responseType="code"
    clientId={TWITTER_OAuth2_CLIENT_ID}
    redirectUri="http://localhost:3000/oauth2/twitter/callback"
    scope="tweet.read users.read"
    state={random(1000, 9999).toString()}
    buttonText="Login with X"
    isCrossOrigin={false}
    onSuccess={response => {
      console.log('Twitter login success');
      console.log(response);
      if(response.code !== null){
        handleOAuthExchange(response.code, 'twitter');
      }
    }}
    onFailure={response => {
      console.log('Twitter login failed');
      console.log(response);
    }}
    extraParams={{ code_challenge: PKCE_code_sha256, code_challenge_method: 'S256' }}
  />
);
}


export function GoogleLoginWithOAuth2Login(){
  //TODO: use inheritance for this
  const [userData, setUserData] = useState<OAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuthExchange = async (code: string, service: 'github' | 'google') => {
    try {
      console.log("handleOAuthExchange code: " + code);
      const response = await fetch('http://127.0.0.1:4000/oauth/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, service }),
      });

      if (!response.ok) {
        throw new Error('OAuth exchange failed');
      }

      const data: OAuthResponse = await response.json();
      console.log("handleOAuthExchange data: " + JSON.stringify(data));
      setUserData(data);
      setError(null);
    } catch (err) {
      console.log("handleOAuthExchange error: " + (err as Error).message);
      setError((err as Error).message);
      setUserData(null);
    }
};

  return(
    <OAuth2Login
      authorizationUrl="https://accounts.google.com/o/oauth2/v2/auth"
      responseType="code"
      clientId={GOOGLE_OAuth2_CLIENT_ID}
      redirectUri="http://localhost:3000/oauth2/google/callback"
      scope="openid email"
      buttonText="Login with Google"
      isCrossOrigin={false}
      onSuccess={response => {
        console.log('Google login success');
        console.log(response);
        if(response.code !== null){
          handleOAuthExchange(response.code, 'google');
        }
      }}
      onFailure={response => {
        console.log('Google login failed');
        console.log(response);
      }}
    />
  );
}


export function GithubLoginWithOAuth2Login(){
  const {workspace, workspaceStateManager} = React.useContext(WorkspaceContext);

  const [userData, setUserData] = useState<OAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuthExchange = async (code: string, service: 'github' | 'google') => {
      try {
        const response = await fetch('http://127.0.0.1:4000/oauth/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, service }),
        });
  
        if (!response.ok) {
          throw new Error('OAuth exchange failed');
        }
  
        const data: OAuthResponse = await response.json() as OAuthResponse;
        console.log("handleOAuthExchange data: " + JSON.stringify(data));
        setUserData(data);
        setError(null);
        workspaceStateManager?.addOAuthUser(data.user, data.user_keys);
      } catch (err) {
        setError((err as Error).message);
        setUserData(null);
      }
  };
    
  return(
    <OAuth2Login
      authorizationUrl="https://github.com/login/oauth/authorize"
      responseType="code"
      clientId={GITHUB_OAuth2_CLIENT_ID}
      redirectUri="http://localhost:3000/oauth2/github/callback"
      scope=""
      buttonText="Login with Github"
      isCrossOrigin={false}
      onSuccess={response => {
        if(response.code !== null){
          handleOAuthExchange(response.code, 'github');
        }
        console.log('Github login success');
        console.log(response);
      }}
      onFailure={response => {
        console.log('Github login failed');
        console.log(response);
      }}
    />
  );
}