Vaults (credential vaults) and credentials are authentication primitives for managed agents: they let you register each end user's third\-party credentials once, reference them by vault ID when creating a session, avoid building your own key store, avoid passing a token on every call, and clearly distinguish which end user the agent is acting on behalf of.

Vaults are referenced at the **session level** . You can manage products at the agent resource level and manage users at the session resource level.

<span id="prerequisites"></span>
## Prerequisites

Before you begin, make sure you have:


* An API key configured as the `ARK_API_KEY` environment variable. For details, see [API key management](https://ai.byteplus.com/ark/region:ap-southeast-1/apiKey).

* A created Agent. For details, see [Define an Agent](https://docs.byteplus.com/en/docs/ModelArk/2553716).

* A created Environment. For details, see [Configure cloud environments](https://docs.byteplus.com/en/docs/ModelArk/2553721).


For the base URL and authentication used in the examples in this section, see [Base URL and authentication](https://docs.byteplus.com/en/docs/ModelArk/1298459).

<span id="create-a-vault"></span>
## Create a vault

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning"><strong>Scope.</strong> Vaults and credentials are isolated by workspace, and any API key in the same workspace can reference them. To revoke access, delete the corresponding vaults or credentials.</div>


Vaults are credential collections bound to an end user. Give it a `display_name`. You can optionally use `metadata` tags to map it back to your own user record:


<Tabs>
<Tab zoneid="IAe8qqjPBm" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Alice",
    "metadata": {"external_user_id": "usr_abc123"}
  }'
```



</Tab>
</Tabs>


The response is the complete vault record:

```JSON
{
  "type": "vault",
  "id": "vlt-20260701120000-pqrst",
  "display_name": "Alice",
  "metadata": {"external_user_id": "usr_abc123"},
  "created_at": "2026-06-29T10:00:00Z",
  "updated_at": "2026-06-29T10:00:00Z"
}
```


<span id="add-credentials-—-three-types"></span>
## Add credentials — three types


<span aceTableMode="list" aceTableWidth="1,2,2"></span>
|Type |Applicable scenarios |Injection method |
|---|---|---|
|`mcp_oauth` |MCP servers use OAuth 2.0. |The platform refreshes tokens on your behalf and automatically injects them when a session connects to the MCP URL. |
|`static_bearer` |MCP uses a fixed bearer token (API key or personal access token). |No refresh flow. Injected directly. |
|`environment_variable` |CLI, SDK, and direct API calls that authenticate through environment variables. |Opaque placeholder in the sandbox. Replaced with the real value at the **egress point** . The agent never sees the key. |


The actual keys you provide (`token`, `access_token`, `refresh_token`, `client_secret`, `secret_value`) are treated as sensitive **write\-only** parameters and are **never** returned in API responses.

<span id="mcp-oauth-credentials"></span>
### MCP OAuth credentials

Use `mcp_oauth` when the MCP server uses OAuth 2.0. After you provide the `refresh` block, the platform refreshes the access token for you when it expires.

Choose one of the following three types for `refresh.token_endpoint_auth.type`:


* `none`: Public client.

* `client_secret_basic`: HTTP basic authentication with `client_secret`.

* `client_secret_post`: Put `client_secret` in the POST request body.



<Tabs>
<Tab zoneid="EQwzbsR9zH" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults/vlt-20260701120000-pqrst/credentials \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Alice Slack",
    "auth": {
      "type": "mcp_oauth",
      "mcp_server_url": "https://mcp.slack.com/mcp",
      "access_token": "xoxp-...",
      "expires_at": "2099-12-31T23:59:59Z",
      "refresh": {
        "token_endpoint": "https://slack.com/api/oauth.v2.access",
        "client_id": "1234567890.0987654321",
        "scope": "channels:read chat:write",
        "refresh_token": "xoxe-1-...",
        "token_endpoint_auth": {
          "type": "client_secret_post",
          "client_secret": "abc123..."
        }
      }
    }
  }'
```



</Tab>
</Tabs>


<span id="mcp-static-bearer-credentials"></span>
### MCP static bearer credentials

Use `static_bearer` when the MCP server accepts a fixed bearer token (API key or personal access token). No refresh flow is required:


<Tabs>
<Tab zoneid="G61lkTAqaf" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults/vlt-20260701120000-pqrst/credentials \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Linear API key",
    "auth": {
      "type": "static_bearer",
      "mcp_server_url": "https://mcp.linear.app/mcp",
      "token": "lin_api_your_linear_key"
    }
  }'
```



</Tab>
</Tabs>


<span id="environment-variable-credentials"></span>
### Environment variable credentials

Use `environment_variable` to authenticate to external services through environment variables. It applies to CLI, SDK, or direct API calls.

`networking.allowed_hosts` controls which outbound hosts the key can be replaced for:


* `"type": "limited"` + an explicit host list ( **recommended** ).

* `"type": "unrestricted"` (use only when the domain names accessed by the caller cannot be enumerated in advance).



<Tabs>
<Tab zoneid="R4dvyfzsv7" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults/vlt-20260701120000-pqrst/credentials \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Notion API key for sandbox",
    "auth": {
      "type": "environment_variable",
      "secret_name": "NOTION_API_KEY",
      "secret_value": "sk-your-secret-here",
      "networking": {
        "type": "limited",
        "allowed_hosts": ["api.notion.com"]
      }
    }
  }'
```



</Tab>
</Tabs>


<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>



* <div data-tips="true" data-tips-type="warning"><strong>Replacement happens at the sandbox egress point, not inside the sandbox.</strong> Processes in the sandbox see an opaque placeholder, not the real value. This has two effects:</div>


   * <div data-tips="true" data-tips-type="warning">Clients that validate credential formats at startup may reject the placeholder.</div>


   * <div data-tips="true" data-tips-type="warning">Clients that use the key to sign requests (for example, AWS SigV4) generate invalid signatures.</div>


   <div data-tips="true" data-tips-type="warning">Environment variable credentials are <strong>only suitable for clients that put the key value as\-is into outbound request headers</strong> .   </div>
   

* <div data-tips="true" data-tips-type="warning"><code>networking.allowed_hosts</code> controls which outbound hosts the key can be replaced for. We <strong>strongly recommend</strong> using <code>type: limited</code> + an explicit host list to avoid sending the key to unauthorized hosts. In addition, the domain name must also be allowed in the <a href="https://docs.byteplus.com/en/docs/ModelArk/2553721">Environment network allowlist</a>. It succeeds only when <strong>both layers include it</strong> .</div>



<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip"><strong>Replacement is outbound only.</strong> If the client uses a stored key to exchange for a session token (for example, OAuth client credentials grant), the returned token reaches the sandbox without redaction. For exchange\-based flows, perform the exchange yourself and store the exchanged token in vaults.</div>


<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip"><strong>Principle of least privilege.</strong> Limit the API key permissions to the minimum set required by the agent. The agent can perform any operation allowed by the key. An overprivileged key increases the impact of an incident if the agent behaves unexpectedly.</div>


<span id="credential-constraints"></span>
### Credential constraints


* **Keys must be unique within each vault.**  `mcp_server_url` (MCP credentials) and `secret_name` (environment variable credentials) must be unique among active credentials in the vault. If a duplicate value is found, error code 409 is returned.

* **Keys are immutable.**  To change `mcp_server_url` or `secret_name`, delete the old credential and create a new one.

* **Each vault can have at most 20 credentials** .


Credentials of MCP (`mcp_oauth`, `static_bearer`) immediately connect to the target MCP server during creation to probe the handshake. Invalid credentials directly return a 4xx error and creation fails. `environment_variable` credentials are not validated during creation. Invalid keys appear as authentication errors or downstream errors when the corresponding host is accessed during session runtime. The error is emitted but does not stop the session from continuing.

<span id="reference-vaults-when-creating-a-session"></span>
## Reference vaults when creating a session

When creating a session, pass the `vault_ids` array to attach one or more vaults to the session:


<Tabs>
<Tab zoneid="DC7qPaR8Wf" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agent-20260701120000-abcde",
    "environment_id": "env-20260701120000-fghij",
    "vault_ids": ["vlt-20260701120000-pqrst"],
    "title": "Alice Slack digest"
  }'
```



</Tab>
</Tabs>


**Runtime behavior** :


* When the agent connects to an MCP URL, **no credential matches** `mcp_server_url` → It tries to connect anonymously. If the server requires authentication, an error is reported.

* **Multiple vaults contain matching credentials** → **The first matching vaults resource takes priority** .

* In [Multi-agent](https://docs.byteplus.com/en/docs/ModelArk/2553730), vaults credentials take effect **by thread** . If an agent declares a matching MCP server in its own definition, that agent uses these credentials for authentication.


<span id="rotate-credentials"></span>
## Rotate credentials

Key values and `display_name` can be updated. Structural parameters (`mcp_server_url`, `secret_name`, `token_endpoint`, `client_id`) are locked after creation. To modify structural parameters, delete the old credential and create a new one:


<Tabs>
<Tab zoneid="yYFGyviAYD" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults/vlt-20260701120000-pqrst/credentials/vcrd-20260701120500-uvwxy \
  -X POST \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "auth": {
      "type": "mcp_oauth",
      "access_token": "xoxp-new-...",
      "expires_at": "2099-12-31T23:59:59Z",
      "refresh": {"refresh_token": "xoxe-1-new-..."}
    }
  }'
```



</Tab>
</Tabs>


<span id="credential-lifecycle"></span>
## Credential lifecycle

Credentials are **periodically re\-resolved** during a session and within the vaults lifecycle. This ensures that credential rotation, deletion, and refresh failures can propagate to running sessions without restart.

For `mcp_oauth` credentials, re\-resolution also refreshes the access token when it expires. If refresh fails, the system records a failure event. Future versions will support subscribing to `vault.* / vault_credential.*` events through webhooks. You can then subscribe to these lifecycle events in this section.


<span aceTableMode="list" aceTableWidth="1,2"></span>
|Event |Trigger |
|---|---|
|`vault.deleted` |A vault is deleted (cascades to trigger `vault_credential.deleted` for underlying credentials). |
|`vault_credential.deleted` |The credential is deleted (deleted directly or due to vaults deletion). |
|`vault_credential.refresh_failed` |`mcp_oauth` credential refresh fails (the refresh token is invalid, or the OAuth server returns a non\-recoverable error). |


Diagnose OAuth refresh failures

Call `POST /vaults/{vault_id}/credentials/{credential_id}/mcp_oauth_validate` to diagnose the cause of a refresh failure. The `status` parameter in the response tells you what to do next:


<span aceTableMode="list" aceTableWidth="1,2,2"></span>
|`status` |Meaning |Next step |
|---|---|---|
|`valid` |The token is valid. |No action required |
|`invalid` |Authorization has expired, or the OAuth server rejects the refresh with 4xx. |Prompt the end user to authorize again. |
|`unknown` |Temporary error (5xx, 429, or network failure). |Wait and retry. |



<Tabs>
<Tab zoneid="KxoevkkZPz" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/vaults/vlt-20260701120000-pqrst/credentials/vcrd-20260701120500-uvwxy/mcp_oauth_validate \
  -X POST \
  -H "Authorization: Bearer $ARK_API_KEY"
```



</Tab>
</Tabs>


The response is a `vault_credential_validation` object. `mcp_probe` contains the failed MCP handshake step, and `refresh` contains the result of the refresh attempt:

```JSON
{
  "type": "vault_credential_validation",
  "credential_id": "vcrd-20260701120500-uvwxy",
  "vault_id": "vlt-20260701120000-pqrst",
  "validated_at": "2026-06-29T17:12:00Z",
  "has_refresh_token": false,
  "status": "invalid",
  "mcp_probe": {
    "method": "initialize",
    "http_response": {
      "status_code": 401,
      "content_type": "application/json",
      "body": "{\"error\":\"invalid_token\"}",
      "body_truncated": false
    }
  },
  "refresh": {
    "status": "no_refresh_token",
    "http_response": null
  }
}
```


<span id="other-operations"></span>
## Other operations


* List vaults and credentials: `GET /vaults` or `GET /vaults/{id}/credentials`. Results are paginated and sorted from newest to oldest.

* Delete vaults and credentials: hard delete. All related records and keys are deleted together and cannot be recovered.




