Run your first ModelArk\-managed agent in four steps: create an agent, create an environment, start a session, send a message and receive a streaming response.

<span id="prerequisites"></span>
# Prerequisites

<span id="get_api_key"></span>
## 1. Get and configure the API key


1. Get an API key: go to the [API keys page](https://ai.byteplus.com/ark/region:ap-southeast-1/apiKey) and create your API key.

2. Configure the environment variable: run the following command in the terminal. Replace `your_api_key_here` with your ModelArk API key to configure the API key as an environment variable.


For how to configure persistent environment variables, see the [Environment variable configuration guide](https://docs.byteplus.com/en/docs/ModelArk/1820161).


<Tabs>
<Tab zoneid="lh1GGwWrUq" title="macOS">
<TabTitle>macOS</TabTitle>

```Bash
export ARK_API_KEY="your_api_key_here"
```



</Tab>
<Tab zoneid="DKVagIfMye" title="Linux">
<TabTitle>Linux</TabTitle>

```Bash
export ARK_API_KEY="your_api_key_here"
```



</Tab>
<Tab zoneid="GQKlyErkhU" title="Windows_CMD">
<TabTitle>Windows_CMD</TabTitle>

```Bash
setx ARK_API_KEY "your_api_key_here"
```



</Tab>
<Tab zoneid="HwniOjMecT" title="Windows_PowerShell">
<TabTitle>Windows_PowerShell</TabTitle>

```PowerShell
$env:ARK_API_KEY = "your_api_key_here"
```



</Tab>
</Tabs>


<span id="enable_managed_agent"></span>
## 2. Activate the Managed Agents service

Go to the [Model activation page](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement), switch to the **Managed Agents** tab, and activate the service.

<span id="enable_model_service"></span>
## 3. Activate the model service

Go to the [Model activation page](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement) to activate the model service.

<span id="create_agent"></span>
# 1. Create an agent

Create an agent and define its model, system prompt, and available tools.

```Bash
agent=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/agents" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "name": "Quick Start Agent",
  "model": {"id": "dola-seed-2-1-turbo-260628"},
  "system": "You are an efficient programming assistant skilled at writing code and troubleshooting issues.",
  "tools": [
    {"type": "agent_toolset_20260701"}
  ]
}
EOF
)

AGENT_ID=$(jq -er '.id' <<<"$agent")

echo "Agent ID: $AGENT_ID"
```


<span id="create_environment"></span>
# 2. Create an environment

The environment defines the sandbox where the agent runs.

> `name` must be unique within the current project. Duplicate names return a 400 error.


```Bash
environment=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/environments" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "name": "demo-env",
  "config": {
    "type": "cloud",
    "networking": {"type": "unrestricted"}
  }
}
EOF
)

ENVIRONMENT_ID=$(jq -er '.id' <<<"$environment")

echo "Environment ID: $ENVIRONMENT_ID"
```


<span id="create_session"></span>
# 3. Start a session

Create a session that references your agent and environment.

```Bash
session=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "title": "Quickstart session"
}
EOF
)

SESSION_ID=$(jq -er '.id' <<<"$session")

echo "Session ID: $SESSION_ID"
```


<span id="send_message_stream"></span>
# 4. Send messages and stream responses

Send a user message to the session, and receive the agent's streaming response through SSE.

```Bash
# Send the user message first; the API buffers events until the stream attaches
curl -sS --fail-with-body \
  "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/$SESSION_ID/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- >/dev/null <<'EOF'
{
  "events": [
    {
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Write a Python script to generate the first 20 Fibonacci numbers and save them to fibonacci.txt."}
      ]
    }
  ]
}
EOF

# Open the SSE stream and process events as they arrive
while IFS= read -r line; do
  [[ $line == data:* ]] || continue
  json=${line#data: }
  case $(jq -r '.type' <<<"$json") in
    agent.message)
      jq -j '.content[] | select(.type == "text") | .text' <<<"$json"
      ;;
    agent.tool_use)
      printf '\n[Using tool: %s]\n' "$(jq -r '.name' <<<"$json")"
      ;;
    session.status_idle)
      printf '\n\nAgent finished.\n'
      break
      ;;
  esac
done < <(
  curl -sS -N --fail-with-body \
    "https://ark.ap-southeast.bytepluses.com/api/v3/sessions/$SESSION_ID/events/stream" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Accept: text/event-stream" 2>/dev/null
)
```


**Example output:** 

```Plain Text
[Using tool: write]

[Using tool: bash]

[Using tool: read]
Completed tasks:
1. Wrote the Python script /workspace/generate_fibonacci.py to generate the Fibonacci sequence.
2. Successfully ran the script. The first 20 generated Fibonacci numbers are: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181].
3. The result is saved to the /workspace/fibonacci.txt file. Each Fibonacci number is clearly listed in order, and the content has been verified as correct.

Agent finished.
```


<span id="full_script"></span>
# Full script

Combine the four steps above into a directly runnable script. Add `set -euo pipefail` at the beginning so the script exits immediately if any step fails.

**Instruction:** 


1. Save the following code as `quickstart.sh`.

2. Make sure you have configured the `ARK_API_KEY` environment variable as described in the Prerequisites section, and have installed `curl` and `jq`.

3. Run:

   ```Bash
   bash quickstart.sh
   ```
   


```Bash
#!/usr/bin/env bash
set -euo pipefail

export ARK_API_KEY="${ARK_API_KEY:?Please export ARK_API_KEY first}"
ARK_BASE_URL="https://ark.ap-southeast.bytepluses.com"

# Step 1: Create Agent
agent=$(
  curl -sS --fail-with-body "$ARK_BASE_URL/api/v3/agents" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "name": "Quick Start Agent",
  "model": {"id": "dola-seed-2-1-turbo-260628"},
  "system": "You are an efficient programming assistant skilled at writing code and troubleshooting issues.",
  "tools": [
    {"type": "agent_toolset_20260701"}
  ]
}
EOF
)
AGENT_ID=$(jq -er '.id' <<<"$agent")
echo "Agent ID: $AGENT_ID"

# Step 2: Create Environment
environment=$(
  curl -sS --fail-with-body "$ARK_BASE_URL/api/v3/environments" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<'EOF'
{
  "name": "demo-env",
  "config": {
    "type": "cloud",
    "networking": {"type": "unrestricted"}
  }
}
EOF
)
ENVIRONMENT_ID=$(jq -er '.id' <<<"$environment")
echo "Environment ID: $ENVIRONMENT_ID"

# Step 3: Create Session
session=$(
  curl -sS --fail-with-body "$ARK_BASE_URL/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "title": "Quickstart session"
}
EOF
)
SESSION_ID=$(jq -er '.id' <<<"$session")
echo "Session ID: $SESSION_ID"

# Step 4: Send message and stream response
curl -sS --fail-with-body \
  "$ARK_BASE_URL/api/v3/sessions/$SESSION_ID/events" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- >/dev/null <<'EOF'
{
  "events": [
    {
      "type": "user.message",
      "content": [
        {"type": "text", "text": "Write a Python script to generate the first 20 Fibonacci numbers and save them to fibonacci.txt."}
      ]
    }
  ]
}
EOF

while IFS= read -r line; do
  [[ $line == data:* ]] || continue
  json=${line#data: }
  case $(jq -r '.type' <<<"$json") in
    agent.message)
      jq -j '.content[] | select(.type == "text") | .text' <<<"$json"
      ;;
    agent.tool_use)
      printf '\n[Using tool: %s]\n' "$(jq -r '.name' <<<"$json")"
      ;;
    session.status_idle)
      printf '\n\nAgent finished.\n'
      break
      ;;
  esac
done < <(
  curl -sS -N --fail-with-body \
    "$ARK_BASE_URL/api/v3/sessions/$SESSION_ID/events/stream" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Accept: text/event-stream" 2>/dev/null
)
```


<span id="runtime_notes"></span>
# How it works

When you send a user event, the ModelArk\-managed agent will:


1. **Configure the sandbox** : Your environment configuration determines how the sandbox is built.

2. **Run the agent loop** : ModelArk determines which tools to use based on your message.

3. **Execute tools** : Start the sandbox, and run file writes, bash commands, and other tool calls inside the sandbox.

4. **Stream events** : You receive real\-time updates while the agent is working.

5. **Enter the idle state** : When the agent has no more tasks to perform, it emits a `session.status_idle` event.


<span id="next_steps"></span>
# Next steps


<columns>
<columnsItem zoneid="NvPgM6RyVr">


<card mode="container" href="/en/docs/ModelArk/2553716" >

**Define an agent**

Define the agent's model, system prompt, tool set, and runtime behavior.

</card>




<card mode="container" href="/en/docs/ModelArk/2553721" >

**Configure the environment**

Configure the cloud sandbox environment where the agent runs, including the network, preinstalled dependencies, and environment variables.

</card>



</columnsItem>
<columnsItem zoneid="dqu95UAnUo">


<card mode="container" href="/en/docs/ModelArk/2553719" >

**Agent tools**

Configure the set of tools that the agent can call in a session.

</card>




<card mode="container" href="/en/docs/ModelArk/2553725" >

**Session event stream**

Receive agent messages, tool calls, and status updates in real time through the SSE event stream.

</card>



</columnsItem>
</columns>




