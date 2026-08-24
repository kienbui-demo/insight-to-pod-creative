A session is one instance of a managed agent running an agent in an environment. A session maintains conversation history across multiple interactions and preserves sandbox state, allowing the agent to remember what it did in previous turns.

It takes two steps to starting a session:


1. Create a session: configure the sandbox and bind the agent to the environment. At this point, the agent does **not** start any work.

2. Send the first event: use a `user.message` event to hand the task to the agent. The session enters the `running` state and starts execution.


<span id="prerequisites"></span>
## Prerequisites

<span id="create-a-session"></span>
## Create a session

Creating a session requires two upstream resource IDs:


* Agent ID: obtained after creating an agent as explained in [Define an agent](https://docs.byteplus.com/en/docs/ModelArk/2553716), in a format such as `agent-20260701120000-abcde`.

* Environment ID: obtained after creating one as explained in [Configure a cloud environment](https://docs.byteplus.com/en/docs/ModelArk/2553721), in a format such as `env-20260701120000-fghij`.


<span id="use-the-latest-agent-version-recommended-for-getting-started"></span>
### Use the latest agent version (recommended for getting started)

An agent is a versioned resource. When the `agent` ID is passed as a string, the session starts with the **latest version** of that agent.


<Tabs>
<Tab zoneid="qpCRCDffiD" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agent-20260701120000-abcde",
    "environment_id": "env-20260701120000-fghij"
  }'
```



</Tab>
</Tabs>


The response returns the full session record. The `id` parameter (in a format such as `sesn-20260701120100-klmno`) is the entry point for all subsequent operations:

```JSON
{
  "id": "sesn-20260701120100-klmno",
  "type": "session",
  "status": "idle",
  "environment_id": "env-20260701120000-fghij",
  "agent": {
    "id": "agent-20260701120000-abcde",
    "type": "agent",
    "version": 3
  },
  "created_at": "2026-06-29T10:00:00Z",
  "updated_at": "2026-06-29T10:00:00Z",
  "resources": [],
  "vault_ids": null
}
```


In the response, `status` is `idle`, indicating that the session is ready and waiting for the first event. A session goes through state transitions such as `idle` → `running` → `idle`/`terminated`. When it enters `idle`, the sandbox creates a checkpoint to preserve the full state for later recovery. For details about the state machine and checkpoint retention period, see [Manage sessions](https://docs.byteplus.com/en/docs/ModelArk/2553724).

<span id="lock-an-agent-version-canary-release-scenario"></span>
### Lock an agent version (canary release scenario)

When you need to lock a session to a specific version of an agent, such as for rollback, canary comparison, or a finalized product release, pass `agent` as an object and explicitly specify `version`:


<Tabs>
<Tab zoneid="Kyv4mxHIgV" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": {"type": "agent", "id": "agent-20260701120000-abcde", "version": 1},
    "environment_id": "env-20260701120000-fghij"
  }'
```



</Tab>
</Tabs>


After the version is locked, even if the agent releases a new version later, this session still runs with the behavior of `version: 1`. This lets you roll out a new version in canary stages without affecting the behavior consistency of existing sessions.

<span id="inject-end-user-credentials-through-vaults-optional"></span>
## Inject end\-user credentials through vaults (optional)

If the agent is configured with MCP tools that require authentication (for details, see [Authenticate with vaults](https://docs.byteplus.com/en/docs/ModelArk/2553726)), reference the pre\-stored credentials through `vault_ids` when creating the session. ModelArk automatically manages token refresh and injection.

The minimal example below mounts vaults (credential vaults) to a session:


<Tabs>
<Tab zoneid="hu6xteJXFO" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agent-20260701120000-abcde",
    "environment_id": "env-20260701120000-fghij",
    "vault_ids": ["vlt-20260701120000-pqrst"]
  }'
```



</Tab>
</Tabs>


For multiple vaults matching rules, runtime behavior when no match is found, rotation, and diagnostics, see [Authenticate with vaults](https://docs.byteplus.com/en/docs/ModelArk/2553726).

<span id="start-a-session-send-the-first-event"></span>
## Start a session: send the first event

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning"><strong>Creating a session only completes sandbox configuration and does not start any work.</strong> You must send a <code>user.message</code> event before the agent starts execution.</div>


This decoupled design lets the client inject vaults credentials and check the sandbox environment before sending the first event to start the agent.

Submit a `user.message` event to the session event entry point `POST /sessions/{session_id}/events`. The session state switches from `idle` to `running`, and the agent starts working.


<Tabs>
<Tab zoneid="guV0fDmQAW" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "type": "user.message",
        "content": [
          {"type": "text", "text": "List the files in the working directory."}
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


<span id="response-model-and-next-steps"></span>
### Response model and next steps

After the event is sent, the session enters the `running` state. To see the agent's progress in real time, including messages, tool calls, and reasoning process, open an SSE stream with [Session event stream](https://docs.byteplus.com/en/docs/ModelArk/2553725) to receive `agent.*` events. If you only need to poll the status, periodically get the session details. For details, see [Manage sessions](https://docs.byteplus.com/en/docs/ModelArk/2553724).



