Tool permission policies are used to control whether tool calls initiated by an agent are executed automatically or paused for confirmation.

The current permission policies apply only to tools executed on the server side:


* Built\-in toolset `agent_toolset_20260701`

* MCP toolset `mcp_toolset`


<span id="permission-policy-types"></span>
# Permission policy types


<span aceTableMode="list" aceTableWidth="1,3"></span>
|Policies |Description |
|---|---|
|`always_allow` |Tool calls are executed automatically and do not require human confirmation. |
|`always_ask` |Pause before a tool call and continue after confirmation. |


The default behavior is as follows:


* `agent_toolset_20260701` uses `always_allow` by default.

* `mcp_toolset` uses `always_ask` by default.


This set of defaults works for most scenarios: built\-in tools have relatively controllable risks, while MCP tools are better suited to being restricted first and then allowed as needed.

<span id="set-a-permission-policy-for-an-entire-toolset"></span>
# Set a permission policy for an entire toolset

You can configure a unified policy for an entire toolset in `default_config.permission_policy`.

The following example changes the default policy of the built\-in toolset to `always_ask`:


<Tabs>
<Tab zoneid="XQPyRnj7ly" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CautiousAgent",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701",
        "default_config": {
          "permission_policy": {
            "type": "always_ask"
          }
        }
      }
    ]
  }'
```



</Tab>
</Tabs>


If you omit `default_config.permission_policy`, the system falls back to the default policy of that toolset.

<span id="override-the-permission-policy-for-a-single-tool"></span>
# Override the permission policy for a single tool

In addition to setting a default policy for an entire toolset, you can also apply more fine\-grained overrides to individual tools in `configs`.

The following example keeps the built\-in toolset's default automatic execution, but requires confirmation before each `bash` execution:


<Tabs>
<Tab zoneid="U6qGjN4TDV" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CommandsCautiousAgent",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "tools": [
      {
        "type": "agent_toolset_20260701",
        "configs": [
          {
            "name": "bash",
            "permission_policy": {
              "type": "always_ask"
            }
          }
        ]
      }
    ]
  }'
```



</Tab>
</Tabs>


This override relationship is suitable for keeping most low\-risk tools running automatically, while adding an extra confirmation step only for high\-risk tools.

<span id="about-evolution-tools"></span>
# About evolution tools

`evolution` / `advisor` does not support configuring `permission_policy`. You can use `configs[].enabled` to control whether advisor is enabled, but you should not manually pass the following in the request body:


* `default_config.permission_policy`

* `configs[].permission_policy`


If you need to control whether advisor is enabled or disabled, see [Tools](https://docs.byteplus.com/en/docs/ModelArk/2553719) for details.

<span id="set-a-permission-policy-for-the-mcp-toolset"></span>
# Set a permission policy for the MCP toolset

`mcp_toolset` is `always_ask` by default. If you trust an MCP server, you can also explicitly change it to `always_allow`:


<Tabs>
<Tab zoneid="owi0UM7zAw" title="Curl">
<TabTitle>Curl</TabTitle>

```Bash
curl https://ark.ap-southeast.bytepluses.com/api/v3/agents \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHubCollaborationAssistant",
    "model": {
      "id": "dola-seed-2-1-turbo-260628"
    },
    "mcp_servers": [
      {
        "type": "url",
        "name": "github",
        "url": "https://mcp.example.com/github"
      }
    ],
    "tools": [
      {
        "type": "agent_toolset_20260701"
      },
      {
        "type": "mcp_toolset",
        "mcp_server_name": "github",
        "default_config": {
          "permission_policy": {
            "type": "always_allow"
          }
        }
      }
    ]
  }'
```



</Tab>
</Tabs>


<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">Note</div>


<div data-tips="true" data-tips-type="warning">We recommend using <code>always_allow</code> only after you have confirmed that the MCP server and the tools it exposes are trustworthy. If the MCP server adds tools in the future, automatic approval also takes effect for them.</div>


<span id="usage-tips"></span>
# Usage tips


* For read\-only tools, consider `always_allow` first.

* For tools that modify files, execute commands, or access external systems, we recommend considering `always_ask` first.

* For MCP tools, we recommend first narrowing `configs` based on the principle of least privilege, and then deciding whether to allow automatic execution.


If you have not configured the toolset itself, see [Tools](https://docs.byteplus.com/en/docs/ModelArk/2553719) for details. If you want to manage an MCP server and its tools, see [MCP](https://docs.byteplus.com/en/docs/ModelArk/2553718) for details.

<span id="related-documents"></span>
# Related documents


<columns>
<columnsItem zoneid="Cn5pq3nvrd">


<card mode="container" href="/en/docs/ModelArk/2553716" >

**Agent**

An agent is a configuration template that contains basic information, system prompt, and extended capabilities.

</card>




<card mode="container" href="/en/docs/ModelArk/2553717" >

**Skills**

Skills are used to add domain knowledge, operation processes, and best practices to an agent.

</card>



</columnsItem>
<columnsItem zoneid="QsgzoDTOsd">


<card mode="container" href="/en/docs/ModelArk/2553718" >

**MCP**

MCP (Model Context Protocol) is used to connect tools and data sources from third\\-party systems to an agent.

</card>




<card mode="container" href="/en/docs/ModelArk/2553719" >

**Tools**

Tools determine which execution capabilities an agent can call in a session.

</card>



</columnsItem>
</columns>




