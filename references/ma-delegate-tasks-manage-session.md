After a session is created, the client can manage its lifecycle: check its status, list its history, and permanently delete it. This document describes the session state machine and three types of operations: retrieve, list, and delete.

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">tip</div>


<div data-tips="true" data-tips-type="tip">For details about how to create a session and send the first event, see <a href="https://docs.byteplus.com/en/docs/ModelArk/2553723">Start session</a>.</div>


<span id="prerequisites"></span>
## Prerequisites

Before you begin, make sure you have:


* An API key configured as the `ARK_API_KEY` environment variable. For details, see [API key management](https://ai.byteplus.com/ark/region:ap-southeast-1/apiKey).

* A created Agent. For details, see [Define an Agent](https://docs.byteplus.com/en/docs/ModelArk/2553716).

* A created Environment. For details, see [Configure cloud environments](https://docs.byteplus.com/en/docs/ModelArk/2553721).


For the base URL and authentication used in the examples in this section, see [Base URL and authentication](https://docs.byteplus.com/en/docs/ModelArk/1298459).

<span id="session-state-machine"></span>
## Session state machine


<span aceTableMode="list" aceTableWidth="1,2"></span>
|Status |Description |
|---|---|
|`idle` |The agent is waiting for input, such as a user message or tool confirmation. The session starts in the `idle` status. |
|`running` |The agent is actively running. |
|`rescheduled` |A transient error occurred, and the system is automatically retrying. |
|`terminated` |The session ended due to an unrecoverable error. |


State transition rules:


* `idle` → `running`: The session receives a user event, such as `user.message` or `user.tool_confirmation`.

* `running` → `idle`: The agent finishes a turn (`end_turn`) or needs to wait for user input (`requires_action`; for details, see [Session event stream](https://docs.byteplus.com/en/docs/ModelArk/2553725)).

* Any status → `terminated`: An unrecoverable error occurs. After termination, the session no longer accepts events, but its record and event history are retained.

* `running` → `rescheduled` → `running`: The framework automatically retries, and the client does not need to intervene.


<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip"><strong>This release does not support</strong> modifying any session parameters while a session is running, including the name, agent configuration, <code>tools</code>, <code>mcp_servers</code>, tool permission policies, and other parameters. To adjust agent capabilities, publish a new agent version and create a new session.</div>


<span id="retrieve-a-session"></span>
## Retrieve a session

Use `GET /sessions/{session_id}` to get the latest status, usage statistics, and configuration snapshot of a session:


<Tabs>
<Tab zoneid="NsRbxHbNpu" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno \
  -H "Authorization: Bearer $ARK_API_KEY"
```



</Tab>
</Tabs>


Main response parameters:


* `id`: The session ID.

* `status`: The current status. See the table above.

* `usage`: The cumulative token usage. For details, see [Session event stream § Track usage](https://docs.byteplus.com/en/docs/ModelArk/2553725).

* `agent`: The bound agent object, including parameters such as `id` and `version`.

* `environment_id`: The bound cloud environment.


If outcome evaluation is configured for the session, the response also includes the `outcome_evaluations` parameter. For details about how to interpret this parameter, see [Define outcomes](https://docs.byteplus.com/en/docs/ModelArk/2553731). This document does not cover it in detail.

<span id="list-sessions"></span>
## List sessions

`GET /sessions` supports filtering by `agent_id` and paginating in descending order by creation time. The response returns the session list in the `data` array:


<Tabs>
<Tab zoneid="YLM79kGYwP" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl "https://ark.ap-southeast.bytepluses.com/api/v3/sessions?agent_id=agent-20260701120000-abcde&limit=20" \
  -H "Authorization: Bearer $ARK_API_KEY"
```



</Tab>
</Tabs>


<span id="delete-a-session"></span>
## Delete a session

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning"><strong>This action is irreversible.</strong> Deletion permanently removes the session record, all events, and the associated sandbox. A session in the <code>running</code> status cannot be deleted. You must first send an <a href="https://docs.byteplus.com/en/docs/ModelArk/2553725">interrupt event</a> to return the session to <code>idle</code>.</div>



<Tabs>
<Tab zoneid="axiGPnatYk" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno \
  -X DELETE \
  -H "Authorization: Bearer $ARK_API_KEY"
```



</Tab>
</Tabs>


Files, memories, vaults, skills, environments, and agents are independent resources and are not affected by session deletion.

<span id="checkpoints-and-sandbox-retention-period"></span>
## Checkpoints and sandbox retention period

When a session enters `idle`, a checkpoint is created for the sandbox, which retains the complete:


* File system state.

* Installed packages.

* Artifact files created by the agent in the sandbox.


This allows the client to resume cleanly from an inactive state. Send a new `user.message` to the session to continue the previous work. For details, see [Session event stream § Resume an idle session](https://docs.byteplus.com/en/docs/ModelArk/2553725).

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip"><strong>Retention period differences</strong> :</div>



* <div data-tips="true" data-tips-type="tip">Session history: <strong>Permanently retained</strong> unless explicitly deleted.</div>


* <div data-tips="true" data-tips-type="tip">Sandbox checkpoint: Expires <strong>30 days</strong> after the last active time.</div>



If your workflow needs to retain the sandbox state for more than 30 days, periodically send a `user.message` before the checkpoint expires, even if it is a no\-op, to reset the inactivity timer.



