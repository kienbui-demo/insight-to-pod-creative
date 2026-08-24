Communication with a managed agent is event\-based. This document describes event types, sending user messages, interrupting sessions, receiving SSE streams, calling tools, resuming sessions, and usage statistics.

<span id="prerequisites"></span>
## Prerequisites

<span id="event-model"></span>
## Event model

Event type strings follow the `{domain}.{action}` naming convention:


* `user.*`: User\-side events sent by the client to the agent, including user messages, dynamic system prompts, interrupts, returned tool confirmations, and outcome definitions.

* `agent.*`: Events sent by the agent to the client, including messages, reasoning progress, tool calls, and multi\-agent messages.

* `session.*`: Session lifecycle and status events, including running, idle, rescheduled, terminated, created, updated, and deleted.

* `span.*`: Execution span events, including model request start, end, and outcome evaluation.

> Although `system.message` is prefixed with `system.`, it is a client upstream event (in the same direction as `user.*` and must be sent in the same request as `user.message`), so it is placed in the user domain.


Each event carries the `id`, `type`, and `processed_at` parameters.`processed_at` being `null` indicates that the event has been enqueued in the framework queue and will be processed only after preceding events have been processed.

Rules for the `events` array in a single `POST /events` request:


* In most scenarios, it can contain only **one** event, such as sending `user.message`, `user.interrupt`, or `user.tool_confirmation` alone.

* The only exception: when sending `user.message`, you can append **one** `system.message` (a runtime dynamic system prompt) **after** it, and `system.message` must be the last element in the array. For details, see [Dynamic system prompt](https://docs.byteplus.com/en/docs/ModelArk/2553725#dynamic-system-prompt).


The event types covered in this section are grouped by event domain (for the complete event types and parameters, see the API reference):


<Tabs>
<Tab zoneid="EjRwwZFsqU" title="User domain">
<TabTitle>User domain</TabTitle>

* `user.message`: A user message sent by the client to the agent. The `content` block array can mix plain text, images, and documents, is added to the session history, and triggers agent processing.

* `system.message`: A dynamic system prompt sent by the client to the agent. It must be sent in the same request as `user.message` (immediately after `user.message` and as the last element in the array). It can be dynamically replaced or appended for each conversation turn, and is concatenated with the fixed system prompt defined for the agent before being sent to the model.

* `user.interrupt`: An interrupt instruction sent by the client to stop the current agent execution. If `session_thread_id` is not specified, all active threads are interrupted.

* `user.tool_confirmation`: The client returns an `allow` or `deny` decision for a tool call protected by a permission policy. It is associated with the pending confirmation event through `tool_use_id`. When `deny` is used, you can optionally pass `deny_message` to return the rejection reason to the agent.

* `user.define_outcome`: The client defines the output criteria and scoring rubric for this task, triggering subsequent outcome evaluation loops. For details, see [Define outcome](https://docs.byteplus.com/en/docs/ModelArk/2553731).


</Tab>
<Tab zoneid="bAOoc5COYt" title="Agent domain">
<TabTitle>Agent domain</TabTitle>

* `agent.message`: A text response pushed by the agent to the client, used to display conversation content.

* `agent.thinking`: A progress signal sent when the agent is in the deep reasoning stage. It **does not carry the actual reasoning content** and is used only for the client to display a "thinking" state.

* `agent.tool_use`: A built\-in tool call event initiated by the agent. Built\-in tools include: `bash`, `edit`, `read`, `write`, `glob`, `grep`, `web_fetch`, and `web_search`.

* `agent.tool_result`: A receipt for the execution result of a built\-in tool, sent by the framework to the client. It is associated with the corresponding `agent.tool_use` event through the `tool_use_id` parameter.

* `agent.mcp_tool_use`: An MCP tool call event initiated by the agent. The specific tool set is determined by the MCP server configured for the agent.

* `agent.mcp_tool_result`: A receipt for the execution result of an MCP tool, sent by the framework to the client. It is associated with the corresponding `agent.mcp_tool_use` event through the `tool_use_id` parameter.

* `agent.thread_message_sent`: In multi\-agent collaboration scenarios, a message event sent from the main thread to a child thread.

* `agent.thread_message_received`: In multi\-agent collaboration scenarios, a message event received by a child thread from the main thread.

* `agent.thread_context_compacted`: A context compression or summarization event automatically triggered by the system when the context length exceeds the threshold.


</Tab>
<Tab zoneid="L5Eotayn0H" title="Session domain">
<TabTitle>Session domain</TabTitle>

* `session.status_running`: The session status changes to `running`, indicating that the agent is actively executing.

* `session.status_idle`: The session status changes to `idle`, indicating that the agent is paused and waiting for user input. The event carries the `stop_reason` parameter to describe the reason for the pause, such as `end_turn` or `requires_action`.

* `session.status_rescheduled`: The session recovers from a transient error and is requeued for execution. No client intervention is required.

* `session.status_terminated`: The session ends due to normal completion or an unrecoverable error. In this status, the client can no longer send requests to the session.

* `session.error`: An error signal event during session execution, including recoverable transient errors and unrecoverable errors. After receiving this event, the session may be automatically rescheduled to continue execution (recoverable errors, such as model rate limiting), or it may then change to the `terminated` status (unrecoverable errors, such as MCP connection configuration errors). Common error types: `model_overloaded_error`, `model_rate_limited_error`, `model_request_failed_error`, `mcp_connection_failed_error`.

* `session.deleted`: The session is explicitly deleted, the event stream terminates, and all subsequent events are no longer delivered.

* `session.updated`: The session name is modified at runtime.

* `session.thread_created`: In multi\-agent collaboration scenarios, a new child thread is created.

* `session.thread_status_running`: The child thread status changes to `running` and execution starts.

* `session.thread_status_idle`: The child thread status changes to `idle` and pauses to wait for external input.

* `session.thread_status_rescheduled`: The child thread recovers from a transient error and is requeued.

* `session.thread_status_terminated`: The child thread is terminated and no longer accepts new input.


</Tab>
<Tab zoneid="E89wXbGyVG" title="Span domain">
<TabTitle>Span domain</TabTitle>

* `span.model_request_start`: The model request starts, marking the starting point of this LLM call.

* `span.model_request_end`: The model request ends and returns the `model_usage` parameter, which contains usage information for this request, such as input tokens, output tokens, and prompt cache hit tokens.

* `span.outcome_evaluation_start`: The outcome evaluation process starts, and the framework starts an evaluation for the output of this `user.define_outcome`. For details, see [Define outcome](https://docs.byteplus.com/en/docs/ModelArk/2553731).

* `span.outcome_evaluation_ongoing`: A heartbeat event during outcome evaluation. The client uses it to display the "evaluating" state.

* `span.outcome_evaluation_end`: The outcome evaluation cycle ends. The event carries the `status` parameter. Possible values: `satisfied` (satisfied), `needs_revision` (needs revision; a new `_start` round will be triggered later), `max_iterations_reached` (iteration limit reached; the framework will run the agent one more time), `failed` (failed), and `interrupted` (interrupted).


</Tab>
</Tabs>


<span id="integration-events"></span>
## Integration events

<span id="send-messages"></span>
### Send messages

The client sends a `user.message` event to the session through `POST /sessions/{id}/events`. `content` is a block array that can mix three types of blocks: text (`text`), image (`image`), and document (`document`).


* The `source.type` of an `image` supports three types: `base64` (inline base64, requiring `media_type`), `url` (publicly accessible URL), and `file` (uploaded file ID, with the `file_id` parameter).

* The `source.type` of a `document` supports four types: `file` (uploaded file ID), `url` (publicly accessible URL), `base64` (inline base64, requiring `media_type`), and `text` (directly inline plain text, with `media_type: text/plain` plus the `data` parameter). The optional `title` and `context` parameters add a title and background description to the document.

* The `content` array in the same request can mix multiple image/document blocks for multi\-attachment scenarios.

* To dynamically append a system prompt for the current turn, you can place a `system.message` immediately after `user.message` in the `events` array (see [Dynamic system prompt](https://docs.byteplus.com/en/docs/ModelArk/2553725#dynamic-system-prompt)).


<span id="common-content-combination-examples"></span>
#### Common content combination examples


<Tabs>
<Tab zoneid="Z3NyJFvIm3" title="Plain text">
<TabTitle>Plain text</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [{"type": "text", "text": "Help me analyze this sales data and identify anomalies in Q2"}]
    }]
  }'
```



</Tab>
<Tab zoneid="wuDMGCXy8u" title="Text + Image (URL)">
<TabTitle>Text + Image (URL)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "What is wrong about this trend graph?"},
        {"type": "image", "source": {"type": "url", "url": "https://cdn.example.com/q2-trend.png"}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="RsYIeygHoD" title="Text + Image (Base64)">
<TabTitle>Text + Image (Base64)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "What is wrong about this trend graph?"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "iVBORw0KGgoAAAANSUhEUgAA..."}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="sFavE8IWFR" title="Text + Image (file_id)">
<TabTitle>Text + Image (file_id)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "What is wrong about this trend graph?"},
        {"type": "image", "source": {"type": "file", "file_id": "file_img_abc123"}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="I7aqwnEAnu" title="Text + Document (file_id)">
<TabTitle>Text + Document (file_id)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Summarize the key risks in this audit report"},
        {"type": "document", "title": "Q2 audit report.pdf", "context": "Internal audit draft issued by Big4", "source": {"type": "file", "file_id": "file_pdf_xxx"}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="zUbOMu5MoY" title="Text + Document (inline plain text)">
<TabTitle>Text + Document (inline plain text)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Help me rewrite the following description to make it more technical"},
        {"type": "document", "title": "Original draft", "source": {"type": "text", "media_type": "text/plain", "data": "This system provides data analysis capabilities, including but not limited to report generation, anomaly detection..."}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="e6PmxMw0ld" title="Text + Document (Base64 PDF)">
<TabTitle>Text + Document (Base64 PDF)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Extract the key clauses in this contract"},
        {"type": "document", "title": "framework-agreement.pdf", "source": {"type": "base64", "media_type": "application/pdf", "data": "JVBERi0xLjQKJaqr..."}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="j1gYfqFjBq" title="Text + Document (URL)">
<TabTitle>Text + Document (URL)</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Summarize this document in 5 points"},
        {"type": "document", "title": "Company annual report", "source": {"type": "url", "url": "https://investor.example.com/annual-2025.pdf"}}
      ]
    }]
  }'
```



</Tab>
<Tab zoneid="MOCZk2kKIU" title="Text + Multiple attachments">
<TabTitle>Text + Multiple attachments</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Give me a complete analysis based on this transcript and the two images"},
        {"type": "document", "source": {"type": "file", "file_id": "file_doc_01"}},
        {"type": "image", "source": {"type": "file", "file_id": "file_img_01"}},
        {"type": "image", "source": {"type": "file", "file_id": "file_img_02"}}
      ]
    }]
  }'
```



</Tab>
</Tabs>


The `events` parameter in the request body is an event array, and the server processes it serially in enqueue order.

<span id="dynamic-system-prompt"></span>
#### Dynamic system prompt

In addition to the fixed system prompt configured when [defining an agent](https://docs.byteplus.com/en/docs/ModelArk/2553716), the client can also append a `system.message` in the same request that sends `user.message` to dynamically inject extra instructions for the current turn; the fixed system prompt, runtime `system.message`, and user message are concatenated and sent to the model together.


<span aceTableMode="list" aceTableWidth="1,2,2"></span>
|Comparison item |Agent\-defined system prompt |`system.message` event of runtime |
|---|---|---|
|Location |Set when creating the agent |Passed when sending events |
|Takes effect |Concatenated when the session is created and fixed throughout the session lifecycle |Can be dynamically replaced or appended in each conversation turn |
|Concatenation order (first turn) |`[Agent system prompt] [system.message] [user.message]` |Same as the left |
|Concatenation order (subsequent turn) |`[Agent system prompt] [system.message] [system.message] [user.message]` (`system.message` accumulates in each turn) |Same as the left |


**Constraints:** 


* `system.message` cannot be sent alone. It must be in the same request as `user.message`.

* `system.message` must immediately follow `user.message` and be the last element in the `events` array.

* Violating the position constraint returns HTTP 400.



<Tabs>
<Tab zoneid="bztYwmoE02" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {"type": "user.message", "content": [{"type": "text", "text": "What is the current position of my order #1234?"}]},
      {"type": "system.message", "content": [{"type": "text", "text": "You are ACME's customer support assistant. You must use available tools to query orders and must never disclose internal customer IDs."}]}
    ]
  }'
```



</Tab>
</Tabs>


If the request succeeds, HTTP 200 is returned, and the response `data` array contains two event objects in the input order (both with server\-assigned `id`s). If the position is incorrect, HTTP 400 is returned. For example, putting `system.message` before `user.message`:

```JSON
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid \`system.message\` event at events[0]: \`system.message\` must immediately follow a \`user.message\` event in the same request"
  },
  "request_id": "req_01xxxYFT3zKjnUJ"
}
```


<span id="interrupt-a-session"></span>
### Interrupt a session

The client can send a `user.interrupt` event to interrupt the agent's current execution. After the session returns to `idle`, send `user.message` to redirect the agent to a new task (two separate requests):


<Tabs>
<Tab zoneid="R0BD4FGvFQ" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
# Step 1: Send an interrupt event
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"events": [{"type": "user.interrupt"}]}'

# Step 2: After the session returns to idle (after receiving the session.status_idle event), send a new message
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "type": "user.message",
      "content": [{"type": "text", "text": "Instead, focus on fixing the bug in line 42."}]
    }]
  }'
```



</Tab>
</Tabs>


<span id="receive-events-in-streaming-mode-sse"></span>
### Receive events in streaming mode (SSE)

The client opens an SSE stream through `GET /sessions/{session_id}/events/stream` to receive the latest events in real time while the agent is working.

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning"><strong>You must open the SSE stream before sending user events.</strong> The SSE stream only pushes events generated <strong>after</strong> it is opened. Reversing the order causes events to be lost.</div>



<Tabs>
<Tab zoneid="qF6SSUVsdD" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
# Open the stream first
curl -N https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events/stream \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Accept: text/event-stream" &
STREAM_PID=$!

# Then send the user message
curl https://ark.ap-southeast.bytepluses.com/api/v3/sessions/sesn-20260701120100-klmno/events \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{"type": "user.message", "content": [{"type": "text", "text": "Summarize the repo README"}]}]
  }'

wait $STREAM_PID
```



</Tab>
</Tabs>


<span id="reconnect-to-a-session"></span>
### Reconnect to a session

To reconnect to an existing session without missing events, follow the steps below:


1. Open a new event stream.

2. Pull the full event history once, and put all `event.id` values into the "seen set".

3. Follow the real\-time stream and skip IDs that have already been seen.


<span id="other-scenarios"></span>
## Other scenarios

<span id="confirm-tool-calls"></span>
### Confirm tool calls

When the agent is configured with a [tool permission policy](https://docs.byteplus.com/en/docs/ModelArk/2553720) that requires confirmation before tool execution, the workflow is as follows:


1. The session emits an `agent.tool_use` or `agent.mcp_tool_use` event.

2. The session enters `idle` and emits `session.status_idle`, carrying `stop_reason.type = "requires_action"`. Blocking event IDs are listed in the `stop_reason.event_ids` array.

3. For each blocking event, send a `user.tool_confirmation` event, pass the event ID to `tool_use_id`, and set the decision result to `"allow"` or `"deny"` (optionally pass `deny_message` to explain the reason for denial).

4. After all blocking events are resolved, the session switches back to `running`.


<span id="reject-tool-calls"></span>
### Reject tool calls

The client sets the `result` parameter of the `user.tool_confirmation` event to `"deny"` and can optionally include the `deny_message` parameter to send the reason for denial back to the agent. After receiving the reason for denial, the agent adjusts its policy accordingly, such as using another tool, using a fallback plan, or repeating the reason for denial to the user.

<div data-tips="true" data-tips-type="tip" data-tips-is-title="true">Tip</div>


<div data-tips="true" data-tips-type="tip">In permission approval and moderation scenarios, an explicit <code>deny</code> with a clear <code>deny_message</code> is safer than silent approval. The agent can perceive the boundary and will not mistakenly think the operation has succeeded.</div>


<span id="resume-an-idle-session"></span>
### Resume an idle session

A session persists between interactions. When a session enters `idle`, the sandbox is checkpointed, and the full state is retained (file system, installed packages, and artifact files). Checkpoints are retained for 30 days (for details, see [Manage sessions § Checkpoints and sandbox retention period](https://docs.byteplus.com/en/docs/ModelArk/2553724)).

Resuming a session does not require a special API. Send `user.message` by following the "Send a user message" flow. The session status switches from `idle` back to `running` and continues the subsequent work.

<span id="track-usage"></span>
### Track usage

The client obtains the token usage of the current model request through the `span.model_request_end` event. The event carries the `model_usage` parameter, which records the usage details of the current request. This parameter is the data source for token billing:

```JSON
{
  "id": "sevt_mre_01",
  "type": "span.model_request_end",
  "processed_at": "2026-05-31T16:00:02.100Z",
  "model_request_start_id": "sevt_mrs_01",
  "is_error": false,
  "model_usage": {
    "input_tokens": 1820,
    "output_tokens": 42,
    "cache_creation_input_tokens": 1500,
    "cache_read_input_tokens": 0,
    "speed": "standard"
  }
}
```


Parameter meanings:


* `input_tokens`: Uncached input tokens.

* `output_tokens`: All output tokens.

* `cache_creation_input_tokens` and `cache_read_input_tokens`: Indicates cache activity (5\-minute TTL. Consecutive turns can reuse cache reads to reduce the per\-token cost).

* `speed`: Speed tier of the current request.


To calculate session\-level totals, the client needs to aggregate `model_usage` from `span.model_request_end` events. The trace view in the console automatically displays the aggregated usage.

<span id="console-observability"></span>
## Console observability

The [Managed Agents](https://console.byteplus.com/ark/region:ark+ap-southeast-1/managedagents) page in the console provides a visual timeline view for sessions:


* Session list: All sessions and their status, creation time, and model.

* Trace view: Events in a session (content, timestamps, and token usage) are displayed in chronological order and are **visible only to developers and administrators** .

* Tool execution: Detailed information about each tool call and its result.


<span id="debugging-tips"></span>
## Debugging tips


* Watch `session.error`: Unrecoverable errors are delivered through this event.

* Check tool results: Failed tool calls usually explain the cause of abnormal agent behavior.

* Track token usage: Monitor consumption to optimize prompts and reduce costs.




