This topic describes how to use Memory Store in ModelArk Managed Agents to provide long\-term memory that can persist across sessions.

By default, each session starts with a fresh context. After a session ends, the preferences, conventions, troubleshooting experience, and business background accumulated by the agent during that run are not automatically carried over to the next task. Memory Store is used to save this reusable information and remount it to the agent in later sessions.

<span id="basic-concepts"></span>
## Basic concepts

After a Memory Store is mounted to a session, it appears as a directory inside the sandbox, and the agent can access the memory content.

> The agent can only read memory content and does not have permission to write to memory.


Each memory item has an independent path. You can read, create, update, and delete memory items directly through the API or the console.

To use Memory Store, you need to enable the agent toolset when creating the agent. The agent reads the mounted directory through standard file tools, and the system automatically provides instructions describing the location and purpose of the memory directory.

<span id="create-a-memory-store"></span>
## Create a Memory Store

When creating a Memory Store, you must provide `name` and `description`. The `description` is shown to the agent and is used to explain what is stored in the store and when it should be used.

```bash
store=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "<MEMORY_STORE_NAME>",
      "description": "<MEMORY_STORE_DESCRIPTION>"
    }'
)

STORE_ID=$(jq -er '.id' <<<"$store")

echo "Memory Store ID: $STORE_ID"
```


The returned Memory Store ID usually has the format `memstore_...`. You need to pass this ID when creating a session and mounting memory.

<span id="preload-memory-content"></span>
## Preload memory content

Before the agent starts running, you can write reference content into the store, such as project conventions, user preferences, output formats, or glossaries.

```bash
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/<MEMORY_1>.md",
    "content": "<CONTENT_OF_THE_MEMORY>"
  }'
```


Each memory item can contain up to 100 KB, roughly 25k tokens. Each store can contain up to 2,000 memory items. It is recommended to split memory into multiple small, focused files instead of using long documents.

<span id="mount-a-memory-store-to-a-session"></span>
## Mount a Memory Store to a session

Memory Store must be mounted through the `resources` array when the session is created. Unlike file and code repository resources, Memory Store can only be mounted when the session is created and cannot be added or removed from a running session.

You can use `instructions` to provide additional guidance for the current session, for example, asking the agent to read a preference file before starting the task. The `instructions` are shown to the agent together with the Store name and description, with a maximum length of 4,096 characters.

```bash
session=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/sessions" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "agent": "$AGENT_ID",
  "environment_id": "$ENVIRONMENT_ID",
  "resources": [
    {
      "type": "memory_store",
      "memory_store_id": "$STORE_ID",
      "instructions": "<SPECIFIC_INSTRUCTIONS>"
    }
  ]
}
EOF
)

printf '%s\n' "$session"

SESSION_ID=$(jq -er '.id' <<<"$session")
```


Up to 10 Memory Stores can be mounted to a single session. You can split Stores by scenario, for example user preferences, project context, and team\-shared conventions, and manage each Store with its own access policy and lifecycle.

<span id="how-the-agent-accesses-memory"></span>
## How the agent accesses memory


* A mounted Memory Store appears under `/mnt/memory/` in the sandbox. The agent uses standard file tools to read files there.

* The agent has read\-only access to memory. It can read memory, but cannot write to or modify it.

* agent reads from memory appear in the session event stream as ordinary tool calls, such as `agent.tool_use` and `agent.tool_result`.


<span id="view-and-edit-memory"></span>
## View and edit memory

You can manage memory through the API to manually review content, correct incorrect memory, import initialization data, or export content.

<span id="list-memory-items"></span>
### List memory items

You can browse memory by path prefix with `path_prefix`, similar to listing a directory.

```bash
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories?path_prefix=/&order_by=path&depth=2" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  | jq -r '.data[] | "\(.type)  \(.path)"'
```


<span id="read-a-memory-item"></span>
### Read a memory item

Reading a single memory item returns the full content.

```bash
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories/$MEMORY_ID" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  | jq -r '.content'
```


<span id="create-a-memory-item"></span>
### Create a memory item

`create` creates a new memory item at the specified `path`. If the path already exists, the original content is not overwritten. To modify an existing memory item, use the update API.

```bash
memory=$(
  curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories" \
    -H "Authorization: Bearer $ARK_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "path": "/path/of/the/memory",
      "content": "<CONTENT_OF_THE_MEMORY>"
    }'
)

MEMORY_ID=$(jq -r '.id' <<<"$memory")
MEMORY_SHA=$(jq -r '.content_sha256' <<<"$memory")
```


<span id="update-a-memory-item"></span>
### Update a memory item

The update API can change content, path, or both. Changing the path can be used for renaming or archiving.

```bash
curl -sS --fail-with-body -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories/$MEMORY_ID" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/new/path"
  }'
```


<span id="delete-a-memory-item"></span>
### Delete a memory item

```bash
curl -sS --fail-with-body -X DELETE "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID/memories/$MEMORY_ID" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="manage-memory-stores"></span>
## Manage Memory Stores

In addition to creation, Memory Store also supports operations such as listing and deletion.

<span id="list-stores"></span>
### List stores

```bash
curl -sS --fail-with-body "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="delete-a-store"></span>
### Delete a store

```bash
curl -sS --fail-with-body -X DELETE "https://ark.ap-southeast.bytepluses.com/api/v3/memory_stores/$STORE_ID" \
  -H "Authorization: Bearer $ARK_API_KEY"
```


<span id="best-practices"></span>
## Best practices

When a store reaches the limit of 2,000 memory items, writes for new memory items fail. Existing memory items can still be read and updated. It is recommended to manage long\-term memory in the following ways:


* **Split stores by purpose** : Do not put everything into one general store. You can create separate stores for users, team\-shared knowledge, and project context.

* **Clean up content before reaching the limit** : Regularly delete outdated or duplicate memory items, or consolidate fragmented content into a more stable summary store.




